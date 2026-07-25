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
        <span className="header__badge">Respuesta a Incidentes</span>
      </div>
      <p className="header__tagline">
        Comprende qué cambió antes de decidir qué hacer.
      </p>
    </header>
  );
}
