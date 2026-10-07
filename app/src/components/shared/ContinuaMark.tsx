import { useActiveLogo } from "@/hooks/useActiveLogo";

/**
 * The Continua brand mark — renders whichever logo image is currently
 * active (the normal logo, or a scheduled seasonal one; see
 * app/src/config/seasonalLogo.ts) at the requested size.
 *
 * Swapping the logo — permanently, or just for a holiday — is an asset +
 * config change, not a code change: see seasonalLogo.ts for how to schedule
 * a temporary one that reverts on its own, or replace
 * app/public/brand/logo.png to change the default for good.
 */
interface ContinuaMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** @deprecated No longer changes rendering now that the mark is a single
   *  flat image — a plain rounded square reads fine in every context this
   *  renders in (nav bar, splash, spinner). Kept only so existing call sites
   *  passing this prop don't need to change. */
  bare?: boolean;
  /** @deprecated No longer used now that the mark is a single flat image
   *  with its own baked-in background — kept only so existing call sites
   *  passing this prop don't need to change. */
  tile?: "auto" | "dark" | "light" | "gradient";
  className?: string;
  /** Use fixed artwork on a fixed canvas, such as the white public website. */
  appearance?: "light" | "dark";
}

export const ContinuaMark = ({ size = 40, className, appearance }: ContinuaMarkProps) => {
  const logoSrc = useActiveLogo(appearance);

  return (
    <img
      src={logoSrc}
      alt="Continua"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "block",
        objectFit: "cover",
        // Proportional to size so it looks right at every size this renders
        // at (nav bar, splash, refresh spinner, etc), matching the original
        // mark's ~24%-of-size squircle rounding.
        borderRadius: Math.round(size * 0.24),
      }}
    />
  );
};
