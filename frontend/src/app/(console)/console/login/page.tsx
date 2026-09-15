import { Suspense } from "react";
import { LoginForm } from "@/features/console/auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
