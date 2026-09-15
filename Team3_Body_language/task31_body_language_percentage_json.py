# ============================================================
# TASK 3 - COMPLETE BODY LANGUAGE ANALYSIS
# Python 3.13 + MediaPipe Tasks API version1
# ============================================================
#
# This version is written for:
#   Python 3.13.x
#   mediapipe 1.x (Tasks API)
#
# It DOES NOT use mp.solutions.
#
# First run:
#   - downloads Face Landmarker and Pose Landmarker .task models
#   - stores them in task3_models/
#
# Main workflow:
#   1. Live rule-based demo
#   2. Collect labelled numerical training data
#   3. Dataset summary
#   4. Train/evaluate ML models
#   5. Final live analysis
#   6. Exit
#
# Observable coaching signals only. This program does not infer
# confidence, honesty, intelligence, personality, or employability.
# ============================================================

import os
import cv2
import math
import time
import json
import urllib.request
from datetime import datetime
from collections import deque, Counter

import joblib
import numpy as np
import pandas as pd
import mediapipe as mp

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


# ------------------------------------------------------------
# STEP 1: Folders
# ------------------------------------------------------------

BASE_FOLDER = os.path.dirname(os.path.abspath(__file__))
DATA_FOLDER = os.path.join(BASE_FOLDER, "task3_data")
MODEL_FOLDER = os.path.join(BASE_FOLDER, "task3_models")
REPORT_FOLDER = os.path.join(BASE_FOLDER, "task3_reports")

os.makedirs(DATA_FOLDER, exist_ok=True)
os.makedirs(MODEL_FOLDER, exist_ok=True)
os.makedirs(REPORT_FOLDER, exist_ok=True)

DATASET_FILE = os.path.join(DATA_FOLDER, "body_language_features.csv")
EVALUATION_FILE = os.path.join(REPORT_FOLDER, "model_evaluation.txt")

FACE_MODEL = os.path.join(MODEL_FOLDER, "face_landmarker.task")
POSE_MODEL = os.path.join(MODEL_FOLDER, "pose_landmarker_full.task")

FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_full/float16/1/"
    "pose_landmarker_full.task"
)


# ------------------------------------------------------------
# STEP 2: Coaching thresholds
# ------------------------------------------------------------

HEAD_YAW_GOOD = 15.0
HEAD_YAW_ALERT = 30.0

HEAD_PITCH_GOOD = 10.0
HEAD_PITCH_ALERT = 20.0

HEAD_ROLL_GOOD = 5.0
HEAD_ROLL_ALERT = 10.0

SHOULDER_TILT_GOOD = 5.0
SHOULDER_TILT_ALERT = 10.0

TORSO_LEAN_GOOD = 10.0
TORSO_LEAN_ALERT = 20.0

HEAD_CENTER_GOOD = 0.10
HEAD_CENTER_ALERT = 0.20

DISTANCE_GOOD_MIN = 0.85
DISTANCE_GOOD_MAX = 1.15
DISTANCE_ALERT_MIN = 0.70
DISTANCE_ALERT_MAX = 1.30

MOVEMENT_STABLE = 0.010
MOVEMENT_HIGH = 0.030

GAZE_HORIZONTAL_LOW = 0.40
GAZE_HORIZONTAL_HIGH = 0.60
GAZE_VERTICAL_LOW = 0.38
GAZE_VERTICAL_HIGH = 0.62

EVENT_DURATION_SECONDS = 1.5
SMOOTHING_WINDOW = 15
JSON_AVERAGE_INTERVAL_SECONDS = 5.0


# ------------------------------------------------------------
# STEP 3: MediaPipe Tasks helpers
# ------------------------------------------------------------

BaseOptions = mp.tasks.BaseOptions
VisionRunningMode = mp.tasks.vision.RunningMode
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions


def ensure_model(path, url, name):
    """Download a MediaPipe .task model if it is missing."""

    if os.path.exists(path) and os.path.getsize(path) > 100000:
        return True

    print(f"\nDownloading {name} model...")
    print("This is a one-time download.")

    try:
        urllib.request.urlretrieve(url, path)
        print(f"Saved: {path}")
        return True
    except Exception as exc:
        print(f"\nCould not download {name} model.")
        print(f"Error: {exc}")
        print("Check your internet connection and run again.")
        return False


def create_pose_landmarker():
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=POSE_MODEL),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=False,
    )
    return PoseLandmarker.create_from_options(options)


def create_face_landmarker():
    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=FACE_MODEL),
        running_mode=VisionRunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    return FaceLandmarker.create_from_options(options)


# ------------------------------------------------------------
# STEP 4: General helpers
# ------------------------------------------------------------

def calculate_distance(point1, point2):
    x1, y1 = point1
    x2, y2 = point2
    return math.hypot(x2 - x1, y2 - y1)


def average_point(points):
    x = sum(p[0] for p in points) / len(points)
    y = sum(p[1] for p in points) / len(points)
    return x, y


def majority_label(history):
    if not history:
        return "UNKNOWN"
    return Counter(history).most_common(1)[0][0]


def safe_float(value, default=0.0):
    try:
        if value is None or np.isnan(value):
            return default
        return float(value)
    except Exception:
        return default


def three_level_status(value, good_limit, alert_limit):
    value = abs(value)
    if value <= good_limit:
        return "GOOD"
    if value <= alert_limit:
        return "WARNING"
    return "ALERT"


def distance_status(ratio):
    if DISTANCE_GOOD_MIN <= ratio <= DISTANCE_GOOD_MAX:
        return "GOOD"
    if DISTANCE_ALERT_MIN <= ratio <= DISTANCE_ALERT_MAX:
        return "WARNING"
    return "ALERT"


def classify_movement_rule(score):
    if score < MOVEMENT_STABLE:
        return "STABLE"
    if score < MOVEMENT_HIGH:
        return "MODERATE"
    return "HIGH"


def classify_posture_rule(features):
    torso_lean = abs(features["torso_lean"])
    shoulder_tilt = abs(features["shoulder_tilt"])
    head_offset = abs(features["head_center_offset"])

    # Forward posture is based on head/torso geometry, not only
    # apparent shoulder width. Shoulder width is kept as a distance signal.
    if torso_lean > TORSO_LEAN_GOOD:
        return "LEAN_LEFT" if features["torso_direction"] < 0 else "LEAN_RIGHT"

    if shoulder_tilt > SHOULDER_TILT_GOOD:
        return "SHOULDERS_TILTED"

    if head_offset > HEAD_CENTER_GOOD:
        return "HEAD_OFF_CENTER"

    return "UPRIGHT"


def classify_gaze_rule(features):
    horizontal = features.get("iris_horizontal_ratio", 0.5)
    vertical = features.get("iris_vertical_ratio", 0.5)
    yaw = features.get("head_yaw", 0.0)

    if vertical < GAZE_VERTICAL_LOW:
        return "UP"
    if vertical > GAZE_VERTICAL_HIGH:
        return "DOWN"
    if horizontal < GAZE_HORIZONTAL_LOW:
        return "LEFT"
    if horizontal > GAZE_HORIZONTAL_HIGH:
        return "RIGHT"
    if yaw < -HEAD_YAW_GOOD:
        return "LEFT"
    if yaw > HEAD_YAW_GOOD:
        return "RIGHT"

    return "CAMERA"


# ------------------------------------------------------------
# STEP 5: Feature extractor
# ------------------------------------------------------------

class FeatureExtractor:

    def __init__(self):
        self.pose = create_pose_landmarker()
        self.face_mesh = create_face_landmarker()

        self.previous_points = None
        self.movement_history = deque(maxlen=15)

        self.baseline_shoulder_width = None
        self.baseline_face_width = None

        self.timestamp_ms = 0

    def reset_motion(self):
        self.previous_points = None
        self.movement_history.clear()

    def set_baseline(self, shoulder_width, face_width):
        self.baseline_shoulder_width = shoulder_width
        self.baseline_face_width = face_width

    def close(self):
        try:
            self.pose.close()
        except Exception:
            pass

        try:
            self.face_mesh.close()
        except Exception:
            pass

    def _next_timestamp(self):
        # MediaPipe Tasks VIDEO mode requires monotonically increasing
        # timestamps.
        self.timestamp_ms += 33
        return self.timestamp_ms

    @staticmethod
    def _pixel_point(landmark, width, height):
        return (
            int(landmark.x * width),
            int(landmark.y * height)
        )

    def _face_width(self, face_landmarks, width, height):
        if len(face_landmarks) <= 454:
            return 0.0

        left = self._pixel_point(face_landmarks[234], width, height)
        right = self._pixel_point(face_landmarks[454], width, height)

        return calculate_distance(left, right)

    def _iris_ratios(self, face_landmarks):
        if len(face_landmarks) < 478:
            return 0.5, 0.5

        right_iris_points = [
            (face_landmarks[i].x, face_landmarks[i].y)
            for i in [469, 470, 471, 472]
        ]

        left_iris_points = [
            (face_landmarks[i].x, face_landmarks[i].y)
            for i in [474, 475, 476, 477]
        ]

        right_iris = average_point(right_iris_points)
        left_iris = average_point(left_iris_points)

        right_corner_1 = (face_landmarks[33].x, face_landmarks[33].y)
        right_corner_2 = (face_landmarks[133].x, face_landmarks[133].y)

        left_corner_1 = (face_landmarks[362].x, face_landmarks[362].y)
        left_corner_2 = (face_landmarks[263].x, face_landmarks[263].y)

        right_top = face_landmarks[159].y
        right_bottom = face_landmarks[145].y

        left_top = face_landmarks[386].y
        left_bottom = face_landmarks[374].y

        def horizontal_ratio(iris_x, p1_x, p2_x):
            minimum = min(p1_x, p2_x)
            maximum = max(p1_x, p2_x)
            width_value = maximum - minimum

            if width_value == 0:
                return 0.5

            return (iris_x - minimum) / width_value

        def vertical_ratio(iris_y, p1_y, p2_y):
            minimum = min(p1_y, p2_y)
            maximum = max(p1_y, p2_y)
            height_value = maximum - minimum

            if height_value == 0:
                return 0.5

            return (iris_y - minimum) / height_value

        right_h = horizontal_ratio(
            right_iris[0],
            right_corner_1[0],
            right_corner_2[0]
        )

        left_h = horizontal_ratio(
            left_iris[0],
            left_corner_1[0],
            left_corner_2[0]
        )

        right_v = vertical_ratio(
            right_iris[1],
            right_top,
            right_bottom
        )

        left_v = vertical_ratio(
            left_iris[1],
            left_top,
            left_bottom
        )

        return (
            float((right_h + left_h) / 2),
            float((right_v + left_v) / 2)
        )

    def _head_pose(self, face_landmarks, width, height):
        """Approximate head pitch/yaw/roll with OpenCV solvePnP."""

        if len(face_landmarks) < 292:
            return 0.0, 0.0, 0.0

        image_points = np.array([
            [face_landmarks[1].x * width, face_landmarks[1].y * height],
            [face_landmarks[152].x * width, face_landmarks[152].y * height],
            [face_landmarks[33].x * width, face_landmarks[33].y * height],
            [face_landmarks[263].x * width, face_landmarks[263].y * height],
            [face_landmarks[61].x * width, face_landmarks[61].y * height],
            [face_landmarks[291].x * width, face_landmarks[291].y * height],
        ], dtype=np.float64)

        model_points = np.array([
            [0.0, 0.0, 0.0],
            [0.0, -63.6, -12.5],
            [-43.3, 32.7, -26.0],
            [43.3, 32.7, -26.0],
            [-28.9, -28.9, -24.1],
            [28.9, -28.9, -24.1],
        ], dtype=np.float64)

        focal_length = float(width)
        center = (width / 2.0, height / 2.0)

        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1],
        ], dtype=np.float64)

        distortion = np.zeros((4, 1), dtype=np.float64)

        try:
            success, rotation_vector, _ = cv2.solvePnP(
                model_points,
                image_points,
                camera_matrix,
                distortion,
                flags=cv2.SOLVEPNP_ITERATIVE,
            )

            if not success:
                return 0.0, 0.0, 0.0

            rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
            angles = cv2.RQDecomp3x3(rotation_matrix)[0]

            return (
                float(angles[0]),
                float(angles[1]),
                float(angles[2]),
            )
        except Exception:
            return 0.0, 0.0, 0.0

    def _draw_pose(self, frame, pose_landmarks):
        height, width, _ = frame.shape

        # Official MediaPipe pose connections.
        connections = [
            (11, 12),
            (11, 13), (13, 15),
            (12, 14), (14, 16),
            (11, 23), (12, 24),
            (23, 24),
            (23, 25), (25, 27),
            (24, 26), (26, 28),
        ]

        points = {}

        for index, landmark in enumerate(pose_landmarks):
            x = int(landmark.x * width)
            y = int(landmark.y * height)
            points[index] = (x, y)

            if index in [0, 11, 12, 23, 24, 15, 16]:
                cv2.circle(frame, (x, y), 4, (0, 255, 0), -1)

        for a, b in connections:
            if a in points and b in points:
                cv2.line(frame, points[a], points[b], (0, 255, 0), 2)

    def _draw_face(self, frame, face_landmarks):
        height, width, _ = frame.shape

        # Draw a light subset of face points to keep the window responsive.
        important = [
            1, 33, 133, 152, 263, 362, 234, 454,
            159, 145, 386, 374,
            469, 470, 471, 472, 474, 475, 476, 477,
        ]

        for index in important:
            if index < len(face_landmarks):
                x = int(face_landmarks[index].x * width)
                y = int(face_landmarks[index].y * height)
                cv2.circle(frame, (x, y), 2, (0, 255, 0), -1)

    def process(self, frame, draw_landmarks=True):
        height, width, _ = frame.shape

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        try:
            mp_image = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=rgb
            )

            timestamp = self._next_timestamp()

            pose_result = self.pose.detect_for_video(
                mp_image,
                timestamp
            )

            face_result = self.face_mesh.detect_for_video(
                mp_image,
                timestamp
            )
        except Exception as exc:
            print(f"MediaPipe frame error: {exc}")
            self.reset_motion()
            return None, frame

        if not pose_result.pose_landmarks:
            self.reset_motion()
            return None, frame

        if not face_result.face_landmarks:
            self.reset_motion()
            return None, frame

        pose_landmarks = pose_result.pose_landmarks[0]
        face_landmarks = face_result.face_landmarks[0]

        if len(pose_landmarks) < 33:
            return None, frame

        if draw_landmarks:
            self._draw_pose(frame, pose_landmarks)
            self._draw_face(frame, face_landmarks)

        # Pose landmark indexes from the MediaPipe Tasks API.
        left_shoulder = self._pixel_point(
            pose_landmarks[11], width, height
        )
        right_shoulder = self._pixel_point(
            pose_landmarks[12], width, height
        )

        left_hip = self._pixel_point(
            pose_landmarks[23], width, height
        )
        right_hip = self._pixel_point(
            pose_landmarks[24], width, height
        )

        left_wrist = self._pixel_point(
            pose_landmarks[15], width, height
        )
        right_wrist = self._pixel_point(
            pose_landmarks[16], width, height
        )

        nose = self._pixel_point(
            pose_landmarks[0], width, height
        )

        # Shoulder geometry.
        shoulder_width = calculate_distance(
            left_shoulder,
            right_shoulder
        )

        if shoulder_width <= 1:
            return None, frame

        dx = abs(right_shoulder[0] - left_shoulder[0])
        dy = abs(right_shoulder[1] - left_shoulder[1])

        shoulder_tilt = (
            math.degrees(math.atan2(dy, dx))
            if dx > 0 else 90.0
        )

        shoulder_center = (
            (left_shoulder[0] + right_shoulder[0]) / 2,
            (left_shoulder[1] + right_shoulder[1]) / 2
        )

        hip_center = (
            (left_hip[0] + right_hip[0]) / 2,
            (left_hip[1] + right_hip[1]) / 2
        )

        torso_dx = shoulder_center[0] - hip_center[0]
        torso_dy = hip_center[1] - shoulder_center[1]

        if abs(torso_dy) < 1:
            torso_lean = 0.0
        else:
            torso_lean = math.degrees(
                math.atan2(abs(torso_dx), abs(torso_dy))
            )

        torso_direction = -1 if torso_dx < 0 else 1

        head_center_offset = (
            (nose[0] - shoulder_center[0]) / shoulder_width
        )

        face_width = self._face_width(
            face_landmarks,
            width,
            height
        )

        if self.baseline_shoulder_width:
            shoulder_width_ratio = (
                shoulder_width / self.baseline_shoulder_width
            )
        else:
            shoulder_width_ratio = 1.0

        if self.baseline_face_width:
            face_width_ratio = (
                face_width / self.baseline_face_width
            )
        else:
            face_width_ratio = 1.0

        iris_horizontal_ratio, iris_vertical_ratio = self._iris_ratios(
            face_landmarks
        )

        head_pitch, head_yaw, head_roll = self._head_pose(
            face_landmarks,
            width,
            height
        )

        current_points = [
            nose,
            left_shoulder,
            right_shoulder,
            left_hip,
            right_hip,
            left_wrist,
            right_wrist,
        ]

        movement_score = 0.0

        if self.previous_points is not None:
            total = 0.0

            for old_point, new_point in zip(
                self.previous_points,
                current_points
            ):
                total += calculate_distance(
                    old_point,
                    new_point
                )

            average_movement = (
                total / len(current_points)
            )

            movement_score = (
                average_movement / shoulder_width
            )

            self.movement_history.append(movement_score)

        self.previous_points = current_points

        if self.movement_history:
            smooth_movement = (
                sum(self.movement_history)
                / len(self.movement_history)
            )
        else:
            smooth_movement = 0.0

        features = {
            "shoulder_width": float(shoulder_width),
            "shoulder_width_ratio": float(shoulder_width_ratio),
            "face_width_ratio": float(face_width_ratio),
            "shoulder_tilt": float(shoulder_tilt),
            "torso_lean": float(torso_lean),
            "torso_direction": int(torso_direction),
            "head_center_offset": float(head_center_offset),
            "head_pitch": float(head_pitch),
            "head_yaw": float(head_yaw),
            "head_roll": float(head_roll),
            "iris_horizontal_ratio": float(iris_horizontal_ratio),
            "iris_vertical_ratio": float(iris_vertical_ratio),
            "movement_score": float(smooth_movement),
        }

        # Explicit shoulder measurement on the camera frame.
        cv2.line(
            frame,
            left_shoulder,
            right_shoulder,
            (255, 180, 0),
            3
        )

        cv2.circle(
            frame,
            (
                int(shoulder_center[0]),
                int(shoulder_center[1])
            ),
            5,
            (0, 0, 255),
            -1
        )

        return features, frame


# ------------------------------------------------------------
# STEP 6: Calibration
# ------------------------------------------------------------

def calibrate_camera(camera, extractor, seconds=3):
    shoulder_values = []
    face_values = []

    start_time = time.time()

    while time.time() - start_time < seconds:
        success, frame = camera.read()

        if not success:
            return False

        frame = cv2.flip(frame, 1)

        old_shoulder = extractor.baseline_shoulder_width
        old_face = extractor.baseline_face_width

        extractor.baseline_shoulder_width = None
        extractor.baseline_face_width = None

        features, frame = extractor.process(frame)

        extractor.baseline_shoulder_width = old_shoulder
        extractor.baseline_face_width = old_face

        if features:
            shoulder_values.append(
                features["shoulder_width"]
            )

            # We need the actual face ratio later, so calculate the
            # current face width indirectly from the ratio only when
            # baseline is available. For calibration, shoulder baseline
            # remains the main camera-distance reference.
            if features["shoulder_width"] > 0:
                face_values.append(
                    features["shoulder_width"]
                )

        remaining = max(
            0,
            int(seconds - (time.time() - start_time)) + 1
        )

        cv2.putText(
            frame,
            "CALIBRATION",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 255, 255),
            2
        )

        cv2.putText(
            frame,
            "Sit normally, stay still, look toward camera",
            (20, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Starting in {remaining}",
            (20, 115),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2
        )

        cv2.imshow(
            "Task 3 - Calibration",
            frame
        )

        if cv2.waitKey(1) & 0xFF == ord("q"):
            cv2.destroyWindow("Task 3 - Calibration")
            return False

    cv2.destroyWindow("Task 3 - Calibration")

    if len(shoulder_values) < 10:
        print("Calibration failed: body was not detected clearly.")
        return False

    baseline_shoulder = float(
        np.median(shoulder_values)
    )

    baseline_face = float(
        np.median(face_values)
    ) if face_values else baseline_shoulder

    extractor.set_baseline(
        shoulder_width=baseline_shoulder,
        face_width=baseline_face
    )

    extractor.reset_motion()

    print(
        "Calibration complete. "
        f"Baseline shoulder width = {baseline_shoulder:.1f}px"
    )

    return True


# ------------------------------------------------------------
# STEP 7: ML feature lists
# ------------------------------------------------------------

GAZE_FEATURES = [
    "iris_horizontal_ratio",
    "iris_vertical_ratio",
    "head_yaw",
    "head_pitch",
    "head_roll",
    "head_center_offset",
]

POSTURE_FEATURES = [
    "shoulder_tilt",
    "torso_lean",
    "torso_direction",
    "shoulder_width_ratio",
    "head_roll",
    "head_center_offset",
]

MOVEMENT_FEATURES = [
    "movement_score",
    "shoulder_tilt",
    "torso_lean",
]


# ------------------------------------------------------------
# STEP 8: Dataset functions
# ------------------------------------------------------------

def save_rows_to_dataset(rows):
    if not rows:
        return

    new_data = pd.DataFrame(rows)

    if os.path.exists(DATASET_FILE):
        old_data = pd.read_csv(DATASET_FILE)
        combined = pd.concat(
            [old_data, new_data],
            ignore_index=True
        )
    else:
        combined = new_data

    combined.to_csv(
        DATASET_FILE,
        index=False
    )

    print(f"Saved {len(rows)} new rows.")
    print(f"Dataset: {DATASET_FILE}")


def collect_labelled_data():
    print("\n--- LABELLED DATA COLLECTION ---")
    print("No raw video is saved.")

    participant_id = input(
        "Enter participant ID (example P01): "
    ).strip()

    if not participant_id:
        participant_id = "P01"

    camera = cv2.VideoCapture(0)

    if not camera.isOpened():
        print("Could not open camera.")
        return

    extractor = FeatureExtractor()

    if not calibrate_camera(
        camera,
        extractor,
        seconds=3
    ):
        camera.release()
        extractor.close()
        cv2.destroyAllWindows()
        return

    label_plan = [
        ("gaze", "CAMERA", "Look toward the camera"),
        ("gaze", "LEFT", "Look to your LEFT"),
        ("gaze", "RIGHT", "Look to your RIGHT"),
        ("gaze", "UP", "Look UP"),
        ("gaze", "DOWN", "Look DOWN"),

        ("posture", "UPRIGHT", "Sit upright"),
        ("posture", "LEAN_LEFT", "Lean your upper body LEFT"),
        ("posture", "LEAN_RIGHT", "Lean your upper body RIGHT"),
        ("posture", "SHOULDERS_TILTED", "Tilt your shoulders"),

        ("movement", "STABLE", "Sit still"),
        ("movement", "MODERATE", "Move moderately"),
        ("movement", "HIGH", "Move your upper body repeatedly"),
    ]

    all_rows = []

    SAMPLE_SECONDS = 4
    SAVE_EVERY_N_FRAMES = 3

    for target_type, label, instruction in label_plan:

        while True:
            success, frame = camera.read()

            if not success:
                break

            frame = cv2.flip(frame, 1)

            features, frame = extractor.process(frame)

            cv2.putText(
                frame,
                f"TARGET: {target_type.upper()} - {label}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (0, 255, 255),
                2
            )

            cv2.putText(
                frame,
                instruction,
                (20, 80),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2
            )

            cv2.putText(
                frame,
                "SPACE=record | N=skip | Q=stop",
                (20, 120),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1
            )

            cv2.imshow(
                "Task 3 - Data Collection",
                frame
            )

            key = cv2.waitKey(1) & 0xFF

            if key == ord(" "):
                break

            if key == ord("n"):
                break

            if key == ord("q"):
                save_rows_to_dataset(all_rows)
                camera.release()
                extractor.close()
                cv2.destroyAllWindows()
                return

        if key == ord("n"):
            continue

        start_time = time.time()
        frame_count = 0
        saved_for_class = 0

        extractor.reset_motion()

        while time.time() - start_time < SAMPLE_SECONDS:
            success, frame = camera.read()

            if not success:
                break

            frame = cv2.flip(frame, 1)

            features, frame = extractor.process(frame)

            remaining = (
                SAMPLE_SECONDS
                - (time.time() - start_time)
            )

            cv2.putText(
                frame,
                f"RECORDING {target_type.upper()} = {label}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (0, 0, 255),
                2
            )

            cv2.putText(
                frame,
                instruction,
                (20, 80),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2
            )

            cv2.putText(
                frame,
                f"Time left: {remaining:.1f}s",
                (20, 115),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2
            )

            cv2.imshow(
                "Task 3 - Data Collection",
                frame
            )

            if cv2.waitKey(1) & 0xFF == ord("q"):
                save_rows_to_dataset(all_rows)
                camera.release()
                extractor.close()
                cv2.destroyAllWindows()
                return

            frame_count += 1

            if (
                features is not None
                and frame_count % SAVE_EVERY_N_FRAMES == 0
            ):
                row = {
                    "participant_id": participant_id,
                    "target_type": target_type,
                    "label": label,
                    "timestamp": datetime.now().isoformat(),
                }

                row.update(features)
                all_rows.append(row)
                saved_for_class += 1

        print(
            f"{target_type} - {label}: "
            f"{saved_for_class} rows collected"
        )

    save_rows_to_dataset(all_rows)

    camera.release()
    extractor.close()
    cv2.destroyAllWindows()

    print("\nData collection complete.")


# ------------------------------------------------------------
# STEP 9: ML training
# ------------------------------------------------------------

def train_one_target(data, target_type, feature_columns):
    subset = data[
        data["target_type"] == target_type
    ].copy()

    if len(subset) == 0:
        print(f"No {target_type} data found.")
        return None, ""

    subset = subset.dropna(
        subset=feature_columns + [
            "label",
            "participant_id"
        ]
    )

    if len(subset) < 20:
        print(
            f"Not enough {target_type} rows. "
            "Collect more samples first."
        )
        return None, ""

    X = subset[feature_columns]
    y = subset["label"]
    groups = subset["participant_id"]

    participants = groups.nunique()

    print(f"\nTraining {target_type.upper()} model")
    print(f"Rows: {len(subset)}")
    print(f"Participants: {participants}")
    print(f"Classes: {sorted(y.unique())}")

    if participants >= 2:
        splitter = GroupShuffleSplit(
            n_splits=1,
            test_size=0.25,
            random_state=42
        )

        train_index, test_index = next(
            splitter.split(X, y, groups=groups)
        )

        X_train = X.iloc[train_index]
        X_test = X.iloc[test_index]
        y_train = y.iloc[train_index]
        y_test = y.iloc[test_index]

        split_note = (
            "Participant-wise train/test split used."
        )
    else:
        print(
            "WARNING: Only one participant found. "
            "Random split is demo-only."
        )

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=0.25,
            random_state=42,
            stratify=y
        )

        split_note = (
            "Random row split used because only one participant "
            "was available. Demo-only evaluation."
        )

    logistic_model = make_pipeline(
        StandardScaler(),
        LogisticRegression(
            max_iter=2000,
            class_weight="balanced"
        )
    )

    logistic_model.fit(
        X_train,
        y_train
    )

    logistic_predictions = logistic_model.predict(
        X_test
    )

    logistic_accuracy = accuracy_score(
        y_test,
        logistic_predictions
    )

    random_forest = RandomForestClassifier(
        n_estimators=150,
        random_state=42,
        class_weight="balanced"
    )

    random_forest.fit(
        X_train,
        y_train
    )

    rf_predictions = random_forest.predict(
        X_test
    )

    rf_accuracy = accuracy_score(
        y_test,
        rf_predictions
    )

    report_text = (
        "\n"
        + "=" * 70
        + "\n"
        + f"{target_type.upper()} MODEL EVALUATION\n"
        + "=" * 70
        + "\n"
    )

    report_text += split_note + "\n"
    report_text += f"Rows: {len(subset)}\n"
    report_text += f"Participants: {participants}\n\n"

    report_text += (
        f"Logistic Regression Accuracy: "
        f"{logistic_accuracy:.4f}\n"
    )

    report_text += (
        f"Random Forest Accuracy: "
        f"{rf_accuracy:.4f}\n\n"
    )

    report_text += (
        "Random Forest Classification Report:\n"
    )

    report_text += classification_report(
        y_test,
        rf_predictions,
        zero_division=0
    )

    report_text += (
        "\nRandom Forest Confusion Matrix:\n"
    )

    report_text += str(
        confusion_matrix(
            y_test,
            rf_predictions,
            labels=sorted(y.unique())
        )
    )

    final_model = RandomForestClassifier(
        n_estimators=150,
        random_state=42,
        class_weight="balanced"
    )

    final_model.fit(X, y)

    model_package = {
        "model": final_model,
        "features": feature_columns,
        "target_type": target_type,
        "classes": sorted(y.unique()),
    }

    model_path = os.path.join(
        MODEL_FOLDER,
        f"{target_type}_model.pkl"
    )

    joblib.dump(
        model_package,
        model_path
    )

    print(f"Saved: {model_path}")
    print(
        f"Random Forest test accuracy: "
        f"{rf_accuracy:.3f}"
    )

    return model_package, report_text


def train_models():
    print("\n--- TRAIN ML MODELS ---")

    if not os.path.exists(DATASET_FILE):
        print("Dataset does not exist yet.")
        print("Choose option 2 first.")
        return

    data = pd.read_csv(DATASET_FILE)

    if len(data) == 0:
        print("Dataset is empty.")
        return

    full_report = (
        "TASK 3 - MODEL EVALUATION\n"
        f"Generated: {datetime.now()}\n"
    )

    _, gaze_report = train_one_target(
        data,
        "gaze",
        GAZE_FEATURES
    )

    _, posture_report = train_one_target(
        data,
        "posture",
        POSTURE_FEATURES
    )

    _, movement_report = train_one_target(
        data,
        "movement",
        MOVEMENT_FEATURES
    )

    full_report += gaze_report
    full_report += posture_report
    full_report += movement_report

    with open(
        EVALUATION_FILE,
        "w",
        encoding="utf-8"
    ) as file:
        file.write(full_report)

    print(
        f"\nEvaluation report saved to: "
        f"{EVALUATION_FILE}"
    )


def load_models():
    models = {}

    for target in [
        "gaze",
        "posture",
        "movement"
    ]:
        path = os.path.join(
            MODEL_FOLDER,
            f"{target}_model.pkl"
        )

        if os.path.exists(path):
            try:
                models[target] = joblib.load(path)
            except Exception:
                pass

    return models


def predict_with_model(model_package, features):
    required_features = model_package["features"]

    row = [
        safe_float(
            features.get(feature_name)
        )
        for feature_name in required_features
    ]

    input_df = pd.DataFrame(
        [row],
        columns=required_features
    )

    prediction = model_package["model"].predict(
        input_df
    )[0]

    return str(prediction)


# ------------------------------------------------------------
# STEP 10: Coaching feedback
# ------------------------------------------------------------

def create_live_feedback(
    features,
    gaze,
    posture,
    movement
):
    feedback = []

    if abs(features["head_yaw"]) > HEAD_YAW_ALERT:
        feedback.append(
            "Head is turned significantly. "
            "Return closer to camera-facing."
        )

    if abs(features["head_pitch"]) > HEAD_PITCH_ALERT:
        feedback.append(
            "Head pitch is high. Keep your head more level."
        )

    if abs(features["head_roll"]) > HEAD_ROLL_ALERT:
        feedback.append(
            "Head tilt is high. Keep your head more neutral."
        )

    if features["shoulder_tilt"] > SHOULDER_TILT_ALERT:
        feedback.append(
            "Shoulders are tilted. Try to level them."
        )

    if features["torso_lean"] > TORSO_LEAN_ALERT:
        feedback.append(
            "Torso lean is high. Return toward upright posture."
        )

    if gaze != "CAMERA":
        feedback.append(
            f"Gaze: {gaze}. Return naturally toward the camera."
        )

    if movement == "HIGH":
        feedback.append(
            "High movement detected. Reduce repeated large movements."
        )

    if posture != "UPRIGHT":
        feedback.append(
            f"Posture: {posture}. Return toward your neutral posture."
        )

    if not feedback:
        feedback.append(
            "Current observable posture is within the coaching zone."
        )

    return feedback[:3]


def panel_text(
    panel,
    text,
    y,
    size=0.52,
    thickness=1
):
    cv2.putText(
        panel,
        text,
        (18, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        size,
        (255, 255, 255),
        thickness
    )


# ------------------------------------------------------------
# 5-second JSON averaging helpers
# ------------------------------------------------------------


def _clip_percent(value):
    """Keep a percentage in the UI-friendly 0-100 range."""
    try:
        return round(float(np.clip(value, 0.0, 100.0)), 2)
    except (TypeError, ValueError):
        return 0.0


def calculate_percentage_scores(interval):
    """
    Convert the observable 5-second signals into UI-facing percentage scores.

    These are coaching/measurement scores derived from the detected signals.
    They are NOT psychological confidence, honesty, personality, or employability
    scores.
    """
    gaze = str(interval.get("dominant_gaze", "unknown")).lower()
    posture = str(interval.get("dominant_posture", "unknown")).lower()
    movement = str(interval.get("dominant_movement", "unknown")).lower()

    # Gaze/head score: percentage of samples facing the camera.
    head_movement_percent = _clip_percent(
        interval.get("camera_facing_gaze_percent", 0.0)
    )

    # Posture score: percentage of samples classified as upright.
    posture_percent = _clip_percent(
        interval.get("upright_posture_percent", 0.0)
    )

    # Movement score: use the interval's movement score when available.
    # If the classifier is categorical, map stable/normal/high movement to
    # an intuitive activity percentage.
    raw_movement_score = interval.get("average_movement_score", None)
    if raw_movement_score is not None:
        try:
            movement_percent = _clip_percent(float(raw_movement_score) * 100.0)
        except (TypeError, ValueError):
            movement_percent = 0.0
    elif movement in {"high", "high movement", "active"}:
        movement_percent = 100.0
    elif movement in {"moderate", "normal", "medium"}:
        movement_percent = 50.0
    elif movement in {"stable", "low", "low movement"}:
        movement_percent = 20.0
    else:
        movement_percent = 0.0

    # Overall score is a transparent average of the three observable scores.
    overall_percent = _clip_percent(
        (head_movement_percent + posture_percent + movement_percent) / 3.0
    )

    return {
        "head_movement_percent": head_movement_percent,
        "posture_percent": posture_percent,
        "movement_percent": movement_percent,
        "overall_percent": overall_percent,
    }


def create_overall_percentage_summary(intervals):
    """Create one UI-ready overall percentage summary from all intervals."""
    if not intervals:
        return {
            "head_movement_percent": 0.0,
            "posture_percent": 0.0,
            "movement_percent": 0.0,
            "overall_percent": 0.0,
        }

    scores = [calculate_percentage_scores(x) for x in intervals]

    return {
        "head_movement_percent": _clip_percent(
            np.mean([x["head_movement_percent"] for x in scores])
        ),
        "posture_percent": _clip_percent(
            np.mean([x["posture_percent"] for x in scores])
        ),
        "movement_percent": _clip_percent(
            np.mean([x["movement_percent"] for x in scores])
        ),
        "overall_percent": _clip_percent(
            np.mean([x["overall_percent"] for x in scores])
        ),
    }


def create_average_interval(samples, start_elapsed, end_elapsed):
    """Create one JSON record containing averages for a time window."""
    if not samples:
        return None

    numeric_keys = [
        "shoulder_width",
        "shoulder_width_ratio",
        "face_width_ratio",
        "shoulder_tilt",
        "torso_lean",
        "torso_direction",
        "head_center_offset",
        "head_pitch",
        "head_yaw",
        "head_roll",
        "iris_horizontal_ratio",
        "iris_vertical_ratio",
        "movement_score",
    ]

    result = {
        "interval_start_seconds": round(start_elapsed, 2),
        "interval_end_seconds": round(end_elapsed, 2),
        "sample_count": len(samples),
    }

    for key in numeric_keys:
        values = [
            safe_float(sample[key])
            for sample in samples
            if key in sample
        ]
        if values:
            result[f"average_{key}"] = round(float(np.mean(values)), 4)

    for key in ["gaze", "posture", "movement"]:
        labels = [sample[key] for sample in samples if key in sample]
        result[f"dominant_{key}"] = majority_label(labels)

    # Average of the percentage of analyzed samples that were in
    # the camera-facing / centered / upright state in this interval.
    result["camera_facing_gaze_percent"] = round(
        sum(sample["gaze"] == "CAMERA" for sample in samples)
        / len(samples) * 100,
        2,
    )
    result["centered_head_percent"] = round(
        sum(abs(safe_float(sample["head_yaw"])) <= HEAD_YAW_GOOD
            for sample in samples)
        / len(samples) * 100,
        2,
    )
    result["upright_posture_percent"] = round(
        sum(sample["posture"] == "UPRIGHT" for sample in samples)
        / len(samples) * 100,
        2,
    )

    return result


def save_interval_json(intervals):
    """Save all 5-second averages to a timestamped JSON file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = os.path.join(
        REPORT_FOLDER,
        f"session_5sec_averages_{timestamp}.json"
    )

    payload = {
        "generated_at": datetime.now().isoformat(),
        "interval_seconds": JSON_AVERAGE_INTERVAL_SECONDS,
        "interval_count": len(intervals),
        "intervals": intervals,
        "note": (
            "Averages are calculated from detected/analyzed frames only. "
            "These are observable coaching signals only; not a measure "
            "of confidence, honesty, intelligence, personality, "
            "or employability."
        ),
    }

    with open(json_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=4)

    return json_path


# ------------------------------------------------------------
# STEP 11: Reports
# ------------------------------------------------------------

def save_session_report(report):
    timestamp = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    json_path = os.path.join(
        REPORT_FOLDER,
        f"session_report_{timestamp}.json"
    )

    txt_path = os.path.join(
        REPORT_FOLDER,
        f"session_report_{timestamp}.txt"
    )

    with open(
        json_path,
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(
            report,
            file,
            indent=4
        )

    with open(
        txt_path,
        "w",
        encoding="utf-8"
    ) as file:
        file.write(
            "TASK 3 - BODY LANGUAGE SESSION REPORT\n"
        )
        file.write("=" * 50 + "\n\n")

        for key, value in report.items():
            file.write(
                f"{key}: {value}\n"
            )

        file.write("\nIMPORTANT:\n")
        file.write(
            "These are observable coaching signals only. "
            "They are not a measure of confidence, honesty, "
            "intelligence, personality, or employability.\n"
        )

    return json_path, txt_path


# ------------------------------------------------------------
# STEP 12: Live analysis
# ------------------------------------------------------------


def save_percentage_summary(intervals):
    """Save the UI-ready overall percentage summary as a JSON file."""
    reports_dir = Path("task3_reports")
    reports_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = reports_dir / f"session_percentage_summary_{timestamp}.json"

    summary = {
        "report_type": "body_language_percentage_summary",
        "generated_at": datetime.now().isoformat(),
        "interval_seconds": JSON_AVERAGE_INTERVAL_SECONDS,
        "total_intervals": len(intervals),
        "percentages": create_overall_percentage_summary(intervals),
        "ui_usage": {
            "head_movement_percent": "0-100 percentage based on camera-facing gaze.",
            "posture_percent": "0-100 percentage based on upright posture.",
            "movement_percent": "0-100 observable movement score.",
            "overall_percent": "Average of head movement, posture, and movement percentages."
        },
        "note": (
            "These are observable computer-vision coaching signals. "
            "They should not be interpreted as confidence, honesty, personality, "
            "intelligence, or employability measurements."
        )
    }

    path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Percentage summary JSON saved to: {path}")
    return path


def run_live_analysis(mode="auto"):
    camera = cv2.VideoCapture(0)

    if not camera.isOpened():
        print("Could not open camera.")
        return

    extractor = FeatureExtractor()

    models = load_models()

    use_ml = (
        mode == "auto"
        and len(models) == 3
    )

    if use_ml:
        print("Using trained ML models.")
    else:
        print("Using rule-based prototype.")

    if not calibrate_camera(
        camera,
        extractor,
        seconds=3
    ):
        camera.release()
        extractor.close()
        cv2.destroyAllWindows()
        return

    gaze_history = deque(
        maxlen=SMOOTHING_WINDOW
    )

    posture_history = deque(
        maxlen=SMOOTHING_WINDOW
    )

    movement_history = deque(
        maxlen=SMOOTHING_WINDOW
    )

    total_frames = 0
    detected_frames = 0
    analyzed_frames = 0

    camera_gaze_frames = 0
    centered_head_frames = 0
    upright_frames = 0

    gaze_away_events = 0
    high_movement_periods = 0

    gaze_away_start = None
    gaze_away_active = False

    high_move_start = None
    high_move_active = False

    # Collect detected results and write one averaged JSON record
    # for every 5-second interval.
    interval_samples = []
    interval_results = []
    interval_start_time = time.time()

    start_time = interval_start_time

    while True:
        success, frame = camera.read()

        if not success:
            break

        total_frames += 1

        frame = cv2.flip(frame, 1)

        features, frame = extractor.process(frame)

        height, width, _ = frame.shape

        panel = np.zeros(
            (height, 560, 3),
            dtype=np.uint8
        )

        cv2.putText(
            panel,
            "TASK 3 - LIVE BODY LANGUAGE",
            (18, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.68,
            (0, 255, 255),
            2
        )

        y = 70

        if features is None:
            panel_text(
                panel,
                "Body/face: NOT FULLY DETECTED",
                y,
                0.55,
                2
            )
            y += 35

            panel_text(
                panel,
                "Keep face + shoulders + upper body visible.",
                y
            )

        else:
            detected_frames += 1
            analyzed_frames += 1

            if use_ml:
                gaze = predict_with_model(
                    models["gaze"],
                    features
                )

                posture = predict_with_model(
                    models["posture"],
                    features
                )

                movement = predict_with_model(
                    models["movement"],
                    features
                )
            else:
                gaze = classify_gaze_rule(
                    features
                )

                posture = classify_posture_rule(
                    features
                )

                movement = classify_movement_rule(
                    features["movement_score"]
                )

            gaze_history.append(gaze)
            posture_history.append(posture)
            movement_history.append(movement)

            stable_gaze = majority_label(
                gaze_history
            )

            stable_posture = majority_label(
                posture_history
            )

            stable_movement = majority_label(
                movement_history
            )

            # Store the current detected result for 5-second averaging.
            interval_samples.append({
                **features,
                "gaze": stable_gaze,
                "posture": stable_posture,
                "movement": stable_movement,
            })

            if stable_gaze == "CAMERA":
                camera_gaze_frames += 1

            if abs(features["head_yaw"]) <= HEAD_YAW_GOOD:
                centered_head_frames += 1

            if stable_posture == "UPRIGHT":
                upright_frames += 1

            # Gaze-away event.
            if stable_gaze != "CAMERA":
                if gaze_away_start is None:
                    gaze_away_start = time.time()

                if (
                    not gaze_away_active
                    and time.time() - gaze_away_start
                    >= EVENT_DURATION_SECONDS
                ):
                    gaze_away_events += 1
                    gaze_away_active = True
            else:
                gaze_away_start = None
                gaze_away_active = False

            # High movement event.
            if stable_movement == "HIGH":
                if high_move_start is None:
                    high_move_start = time.time()

                if (
                    not high_move_active
                    and time.time() - high_move_start
                    >= EVENT_DURATION_SECONDS
                ):
                    high_movement_periods += 1
                    high_move_active = True
            else:
                high_move_start = None
                high_move_active = False

            distance_change = (
                features["shoulder_width_ratio"] - 1
            ) * 100

            yaw_status = three_level_status(
                features["head_yaw"],
                HEAD_YAW_GOOD,
                HEAD_YAW_ALERT
            )

            pitch_status = three_level_status(
                features["head_pitch"],
                HEAD_PITCH_GOOD,
                HEAD_PITCH_ALERT
            )

            roll_status = three_level_status(
                features["head_roll"],
                HEAD_ROLL_GOOD,
                HEAD_ROLL_ALERT
            )

            shoulder_status = three_level_status(
                features["shoulder_tilt"],
                SHOULDER_TILT_GOOD,
                SHOULDER_TILT_ALERT
            )

            torso_status = three_level_status(
                features["torso_lean"],
                TORSO_LEAN_GOOD,
                TORSO_LEAN_ALERT
            )

            model_name = (
                "ML MODELS"
                if use_ml
                else "RULE-BASED DEMO"
            )

            panel_text(
                panel,
                f"Mode: {model_name}",
                y
            )
            y += 30

            panel_text(
                panel,
                "Camera Presence: DETECTED",
                y
            )
            y += 34

            panel_text(
                panel,
                f"Gaze: {stable_gaze}",
                y,
                0.60,
                2
            )
            y += 30

            panel_text(
                panel,
                f"Posture: {stable_posture}",
                y,
                0.60,
                2
            )
            y += 30

            panel_text(
                panel,
                f"Movement: {stable_movement}",
                y,
                0.60,
                2
            )
            y += 36

            panel_text(
                panel,
                f"Shoulder Distance: {features['shoulder_width']:.1f}px",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Distance Change: {distance_change:+.1f}%",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Shoulder Tilt: {features['shoulder_tilt']:.1f} deg | {shoulder_status}",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Torso Lean: {features['torso_lean']:.1f} deg | {torso_status}",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Head Yaw: {features['head_yaw']:.1f} deg | {yaw_status}",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Head Pitch: {features['head_pitch']:.1f} deg | {pitch_status}",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Head Roll: {features['head_roll']:.1f} deg | {roll_status}",
                y
            )
            y += 26

            panel_text(
                panel,
                f"Movement Score: {features['movement_score']:.4f}",
                y
            )
            y += 36

            feedback = create_live_feedback(
                features,
                stable_gaze,
                stable_posture,
                stable_movement
            )

            cv2.putText(
                panel,
                "LIVE COACHING:",
                (18, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 255, 255),
                2
            )

            y += 28

            for message in feedback:
                # Wrap long feedback lines.
                if len(message) > 55:
                    message = message[:52] + "..."

                panel_text(
                    panel,
                    message,
                    y,
                    0.43
                )
                y += 25

        # Every 5 seconds, calculate averages and keep the result
        # for the final JSON file.
        elapsed = time.time() - start_time
        if elapsed >= (len(interval_results) + 1) * JSON_AVERAGE_INTERVAL_SECONDS:
            interval_end = elapsed
            interval_result = create_average_interval(
                interval_samples,
                interval_start_time - start_time,
                interval_end,
            )
            if interval_result is not None:
                interval_results.append(interval_result)
                print(
                    f"5-second JSON interval saved in memory: "
                    f"{interval_result['interval_start_seconds']:.2f}-"
                    f"{interval_result['interval_end_seconds']:.2f}s"
                )
            interval_samples = []
            interval_start_time = time.time()

        final_screen = np.hstack(
            (frame, panel)
        )

        cv2.imshow(
            "Task 3 - Interview Body Language Analysis",
            final_screen
        )

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    duration = time.time() - start_time

    # Save the final partial interval too, if it contains samples.
    if interval_samples:
        final_interval = create_average_interval(
            interval_samples,
            interval_start_time - start_time,
            duration,
        )
        if final_interval is not None:
            interval_results.append(final_interval)

    if total_frames:
        camera_presence_percent = (
            detected_frames / total_frames * 100
        )
    else:
        camera_presence_percent = 0

    if analyzed_frames:
        camera_gaze_percent = (
            camera_gaze_frames / analyzed_frames * 100
        )

        centered_head_percent = (
            centered_head_frames / analyzed_frames * 100
        )

        posture_stability_percent = (
            upright_frames / analyzed_frames * 100
        )
    else:
        camera_gaze_percent = 0
        centered_head_percent = 0
        posture_stability_percent = 0

    interval_json_path = save_interval_json(interval_results)

    report = {
        "generated_at": datetime.now().isoformat(),
        "five_second_average_json": interval_json_path,
        "five_second_interval_count": len(interval_results),
        "analysis_mode": (
            "ML" if use_ml else "rule_based"
        ),
        "session_duration_seconds": round(
            duration,
            2
        ),
        "camera_presence_percent": round(
            camera_presence_percent,
            2
        ),
        "camera_facing_gaze_percent": round(
            camera_gaze_percent,
            2
        ),
        "centered_head_percent": round(
            centered_head_percent,
            2
        ),
        "upright_posture_percent": round(
            posture_stability_percent,
            2
        ),
        "gaze_away_events": int(
            gaze_away_events
        ),
        "high_movement_periods": int(
            high_movement_periods
        ),
        "note": (
            "Observable coaching signals only; not a measure "
            "of confidence, honesty, intelligence, personality, "
            "or employability."
        ),
    }

    json_path, txt_path = save_session_report(
        report
    )

    camera.release()
    extractor.close()
    cv2.destroyAllWindows()

    print("\n--- SESSION REPORT ---")

    for key, value in report.items():
        print(f"{key}: {value}")

    print(f"\nJSON report: {json_path}")
    print(f"5-second averages JSON: {interval_json_path}")
    print(f"Text report: {txt_path}")


# ------------------------------------------------------------
# STEP 13: Dataset summary
# ------------------------------------------------------------

def show_dataset_summary():
    if not os.path.exists(DATASET_FILE):
        print("No dataset found yet.")
        return

    data = pd.read_csv(
        DATASET_FILE
    )

    print("\n--- DATASET SUMMARY ---")
    print(f"Total rows: {len(data)}")
    print(
        f"Participants: "
        f"{data['participant_id'].nunique()}"
    )

    print("\nRows by target and label:")

    print(
        data.groupby(
            ["target_type", "label"]
        )
        .size()
        .to_string()
    )


# ------------------------------------------------------------
# STEP 14: Main menu
# ------------------------------------------------------------

def main():

    print("\n" + "=" * 70)
    print("TASK 3 - PYTHON 3.13 / MEDIAPIPE TASKS VERSION")
    print("=" * 70)

    if not ensure_model(
        FACE_MODEL,
        FACE_MODEL_URL,
        "Face Landmarker"
    ):
        return

    if not ensure_model(
        POSE_MODEL,
        POSE_MODEL_URL,
        "Pose Landmarker"
    ):
        return

    print("\nMediaPipe models are ready.")

    while True:
        print("\n" + "=" * 65)
        print("TASK 3 - BODY LANGUAGE ANALYSIS")
        print("=" * 65)
        print("1. Run live demo now (no ML training required)")
        print("2. Collect labelled ML training data")
        print("3. Show dataset summary")
        print("4. Train and evaluate Gaze/Posture/Movement ML models")
        print("5. Run final live interview analysis (uses ML if trained)")
        print("6. Exit")
        print("=" * 65)

        choice = input(
            "Enter your choice (1-6): "
        ).strip()

        if choice == "1":
            run_live_analysis(
                mode="rule"
            )

        elif choice == "2":
            collect_labelled_data()

        elif choice == "3":
            show_dataset_summary()

        elif choice == "4":
            train_models()

        elif choice == "5":
            run_live_analysis(
                mode="auto"
            )

        elif choice == "6":
            print("Program closed.")
            break

        else:
            print(
                "Please enter a number from 1 to 6."
            )


if __name__ == "__main__":
    main()


# UI JSON structure produced by this version:
# {
#   "interval_start_seconds": 0.0,
#   "interval_end_seconds": 5.0,
#   "percentages": {
#       "head_movement_percent": 82.5,
#       "posture_percent": 90.0,
#       "movement_percent": 45.0,
#       "overall_percent": 72.5
#   }
# }
