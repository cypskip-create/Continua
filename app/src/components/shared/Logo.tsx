import { ContinuaMark } from "./ContinuaMark";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizePx = { sm: 32, md: 40, lg: 56 };

export const Logo = ({ size = "md", showText = true }: LogoProps) => {
  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className="flex items-center space-x-2">
      <ContinuaMark
        size={sizePx[size]}
        className="rounded-xl"
      />
      {showText && (
        <div>
          <span className={`${textSizeClasses[size]} font-medium tracking-tight text-foreground block`}>Continua</span>
          {size === "lg" && (
            <p className="text-xs text-muted-foreground">Pan-African markets, one app</p>
          )}
        </div>
      )}
    </div>
  );
};
