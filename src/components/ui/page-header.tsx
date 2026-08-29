import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-content-muted">
            {breadcrumb.map((crumb, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden>/</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="rounded px-0.5 font-medium hover:text-primary hover:underline"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="px-0.5 font-medium text-content-secondary">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.625rem] leading-tight font-bold tracking-tight text-content">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-pretty text-content-secondary">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
