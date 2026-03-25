import { Link } from "react-router-dom";

interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  crumbs: Crumb[];
}

export function Breadcrumb({ crumbs }: Props) {
  return (
    <nav className="breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i} className="crumb">
          {i > 0 && <span className="separator">›</span>}
          {crumb.to ? (
            <Link to={crumb.to}>{crumb.label}</Link>
          ) : (
            <span className="current">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
