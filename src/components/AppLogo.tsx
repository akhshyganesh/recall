export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={className ? `logo-mark ${className}` : 'logo-mark'}>
      <img src="/recall-mark.svg" alt="" loading="eager" />
    </span>
  );
}

export default function AppLogo() {
  return <BrandMark />;
}