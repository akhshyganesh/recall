import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M15 18l-6-6 6-6" />
    </BaseIcon>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4a2 2 0 110 4 2 2 0 010-4zm0 12a2 2 0 110 4 2 2 0 010-4zm10-8a2 2 0 110 4 2 2 0 010-4z" />
      <path d="M7 8v8" />
      <path d="M9 8h4a4 4 0 004-4" />
    </BaseIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </BaseIcon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" />
    </BaseIcon>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
      <path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
    </BaseIcon>
  );
}

export function FileChangesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 14h6" />
      <path d="M9 18h4" />
    </BaseIcon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </BaseIcon>
  );
}

export function JsonIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 4c-2 0-3 1-3 3v2c0 1.33-.67 2-2 2 1.33 0 2 .67 2 2v2c0 2 1 3 3 3" />
      <path d="M16 4c2 0 3 1 3 3v2c0 1.33.67 2 2 2-1.33 0-2 .67-2 2v2c0 2-1 3-3 3" />
    </BaseIcon>
  );
}

export function MessagesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H9l-5 4v-4H6a2 2 0 01-2-2V5z" />
    </BaseIcon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </BaseIcon>
  );
}

export function ModelIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M9 3v3" />
      <path d="M15 3v3" />
      <path d="M9 18v3" />
      <path d="M15 18v3" />
      <path d="M9 12h6" />
    </BaseIcon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M21 12a9 9 0 00-15.5-6.2" />
      <path d="M3 4v5h5" />
      <path d="M3 12a9 9 0 0015.5 6.2" />
      <path d="M21 20v-5h-5" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </BaseIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M4.5 8.5h15" />
      <path d="M4.5 15.5h15" />
      <circle cx="8" cy="8.5" r="2" />
      <circle cx="16" cy="15.5" r="2" />
    </BaseIcon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3.5l2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.8l-5.56 2.82 1.06-6.2L3 10.03l6.22-.9L12 3.5z" />
    </BaseIcon>
  );
}

export function TimelineIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
      <path d="M9 4h6l1 3H8l1-3z" />
    </BaseIcon>
  );
}
