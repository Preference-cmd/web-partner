import { cn } from 'cn';
import type { HTMLAttributes } from 'react';

const LoaderIcon = ({ size = 16 }: { size?: number }) => (
  <svg height={size} strokeLinejoin="round" viewBox="0 0 16 16" width={size} aria-hidden="true">
    <g clipPath="url(#clip0_2393_1490)">
      <path d="M8 0V4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 16V12" opacity="0.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.29773 1.52783L5.64887 4.7639"
        opacity="0.9"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12.7023 1.52783L10.3511 4.7639"
        opacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12.7023 14.4722L10.3511 11.2361"
        opacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.29773 14.4722L5.64887 11.2361"
        opacity="0.7"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M15.9676 8H11.9676" opacity="0.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 8H0" opacity="0.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.9676 8H11.9676" opacity="0.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 8H0" opacity="0.6" stroke="currentColor" strokeWidth="1.5" />
    </g>
    <defs>
      <clipPath id="clip0_2393_1490">
        <rect fill="white" height="16" width="16" />
      </clipPath>
    </defs>
  </svg>
);

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
  size?: number;
};

export const Loader = ({ className, size = 16, ...props }: LoaderProps) => (
  <div className={cn('inline-flex animate-spin items-center justify-center', className)} {...props}>
    <LoaderIcon size={size} />
  </div>
);
