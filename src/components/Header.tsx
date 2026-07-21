/**
 * @fileoverview Componente Header principal de DriftBrief.
 */

/**
 * Header de la aplicación con branding y tagline.
 * @returns Elemento JSX del header
 */
export function Header() {
  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="header__title">DriftBrief</h1>
        <span className="header__badge">Incident Response</span>
      </div>
      <p className="header__tagline">
        Understand what changed before deciding what to do next.
      </p>
    </header>
  );
}
