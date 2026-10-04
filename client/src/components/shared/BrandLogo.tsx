import './brand.css';

interface BrandLogoProps {
  variant?: 'mark' | 'wordmark';
  className?: string;
  decorative?: boolean;
}

/** Original Metaventions artwork. The white backing keeps its black wordmark
 * readable in both themes; CSS only frames the source's transparent padding. */
export function BrandLogo({ variant = 'mark', className = '', decorative = false }: BrandLogoProps) {
  return (
    <span className={`fa-brand-logo fa-brand-logo--${variant} ${className}`.trim()}>
      <span className="fa-brand-logo-frame">
        <img
          src={`/brand/metaventions-ai-${variant === 'mark' ? 'mark.svg' : 'logo.png'}`}
          alt={decorative ? '' : 'Metaventions AI'}
          width={variant === 'mark' ? 284 : 600}
          height={variant === 'mark' ? 256 : 600}
          decoding="async"
          draggable={false}
        />
      </span>
    </span>
  );
}
