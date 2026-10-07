import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function EngineLaunchButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="engine-launch"
      aria-label="Open Continua Engine"
      onClick={() => navigate("/engine")}
    >
      <Zap aria-hidden="true" className="h-4 w-4" />
      <span>Engine</span>
    </button>
  );
}
