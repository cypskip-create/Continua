import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Slash, Minus, MoveRight, SeparatorHorizontal, SeparatorVertical, Plus, MoveDiagonal2, TrendingUp, Info,
  Rows3, Rows2, PanelTop, SplitSquareHorizontal, GitFork,
  Square, Triangle, Diamond, Circle,
  MoveVertical, MoveHorizontal, Move, TrendingDown, BarChart3,
  Tag, Type, StickyNote, ArrowUpRight, MessageSquare, Flag, Trash2, EyeOff,
  type LucideIcon,
} from "lucide-react";
import { DRAW_TOOL_CATEGORIES, type DrawToolId } from "@/lib/drawingTools";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTool: (tool: DrawToolId) => void;
  hasDrawings: boolean;
  onHideAll?: () => void;
  onClearAll: () => void;
}

const ICONS: Record<DrawToolId, LucideIcon> = {
  "trend-line": Slash,
  "horizontal-line": Minus,
  "horizontal-ray": MoveRight,
  "horizontal-segment": SeparatorHorizontal,
  "vertical-line": SeparatorVertical,
  "cross-line": Plus,
  "extended-line": MoveDiagonal2,
  "trend-angle": TrendingUp,
  "info-line": Info,
  "parallel-lines": Rows3,
  "parallel-channel": Rows2,
  "flat-channel": PanelTop,
  "disjoint-channel": SplitSquareHorizontal,
  pitchfork: GitFork,
  "schiff-pitchfork": GitFork,
  "modified-schiff-pitchfork": GitFork,
  "inside-pitchfork": GitFork,
  rectangle: Square,
  triangle: Triangle,
  parallelogram: Diamond,
  circle: Circle,
  ellipse: Circle,
  "price-range": MoveVertical,
  "date-range": MoveHorizontal,
  "date-price-range": Move,
  "long-position": TrendingUp,
  "short-position": TrendingDown,
  "bars-pattern": BarChart3,
  "price-label": Tag,
  text: Type,
  notes: StickyNote,
  arrow: ArrowUpRight,
  callout: MessageSquare,
  flag: Flag,
};

export function DrawingToolsSheet({ open, onOpenChange, onSelectTool, hasDrawings, onHideAll, onClearAll }: Props) {
  const pick = (tool: DrawToolId) => {
    onSelectTool(tool);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto z-[120]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-sm">Drawing Tools</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-2 mt-2 mb-1 overflow-x-auto scrollbar-hide">
          <Button variant="secondary" size="sm" className="h-9 rounded-xl px-3 text-xs gap-1.5 shrink-0" onClick={onHideAll} disabled={!hasDrawings}>
            <EyeOff className="h-3.5 w-3.5" /> Hide All
          </Button>
          <Button variant="secondary" size="sm" className="h-9 rounded-xl px-3 text-xs gap-1.5 shrink-0 text-bear" onClick={onClearAll} disabled={!hasDrawings}>
            <Trash2 className="h-3.5 w-3.5" /> Delete All
          </Button>
        </div>

        {DRAW_TOOL_CATEGORIES.map((category) => (
          <div key={category.name} className="mt-4">
            <p className="section-eyebrow mb-2">{category.name} ({category.tools.length})</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4">
              {category.tools.map((tool) => {
                const Icon = ICONS[tool.id];
                return (
                  <button
                    key={tool.id}
                    data-small-target
                    onClick={() => pick(tool.id)}
                    className="shrink-0 w-[108px] h-[92px] rounded-2xl bg-secondary/70 active:bg-secondary flex flex-col items-center justify-center gap-2 px-2 text-center transition-colors"
                  >
                    <Icon className="h-5 w-5 text-foreground/90" />
                    <span className="text-[0.6875rem] leading-tight text-foreground/90">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="h-2" />
      </SheetContent>
    </Sheet>
  );
}
