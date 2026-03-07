import { useState, useEffect } from "react";
import { Leaf } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/context/AuthContext";

const Auth = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleGoogleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) console.error("OAuth error:", error);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-primary mb-4">
            <Leaf className="h-7 w-7" />
            <span className="font-display text-2xl font-semibold">Glean</span>
          </Link>
          <h1 className="font-display text-2xl text-foreground">Welcome</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to save highlights and build your collection
          </p>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="h-11 w-full rounded-lg border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
};

export default Auth;
