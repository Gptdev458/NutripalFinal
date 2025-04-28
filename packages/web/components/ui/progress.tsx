'use client';

import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const progressVariants = cva(
  "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
  {
    variants: {
      variant: {
        default: "",
        // Add other variants if needed, e.g., success, warning, danger
        // success: "bg-green-100",
        // warning: "bg-yellow-100",
        // danger:  "bg-red-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const indicatorVariants = cva("h-full w-full flex-1 bg-primary transition-all", {
  variants: {
    variant: {
      default: "bg-blue-600", // Default color
      // success: "bg-green-600",
      // warning: "bg-yellow-500",
      // danger:  "bg-red-600",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants> {
  value?: number | null;
}

const Progress = React.forwardRef<
  React.ElementRef<"div">,
  ProgressProps
>(({ className, variant, value, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(progressVariants({ variant }), className)}
    {...props}
  >
    <div
      className={cn(indicatorVariants({ variant }))}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }} 
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress }; 