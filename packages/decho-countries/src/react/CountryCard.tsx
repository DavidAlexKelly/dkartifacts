/**
 * The facts about a selected country or region, as a card.
 *
 *   <CountryCard selection={selection} sources={controller.data.manifest.sources} />
 *
 * Unstyled beyond layout: it inherits colour and font from where it is put,
 * and takes a className for the rest, so it sits on a light page or a dark map
 * panel alike. Every figure shows its year, and the sources line is there
 * because CC BY data (the World Bank's) must be credited where it is shown.
 */

import React from "react";

import {
  FIGURE_LABELS,
  figuresOf,
  flagEmoji,
  formatFigure,
  orderedFigureKeys,
} from "../core/figures.js";
import type { Figure, SourceInfo } from "../core/types.js";
import type { CountrySelection } from "../extension/index.js";

export interface CountryCardProps {
  selection: CountrySelection | null;
  /** The dataset's sources (`data.manifest.sources`), shown as a credit line. */
  sources?: SourceInfo[];
  onClose?: () => void;
  locale?: string;
  className?: string;
  style?: React.CSSProperties;
}

const muted: React.CSSProperties = { opacity: 0.65 };

function FactRows({
  figures,
  locale,
  extra,
}: {
  figures: Record<string, Figure & { members?: number }>;
  locale: string;
  extra?: Array<[string, React.ReactNode]>;
}): React.ReactElement {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", margin: "8px 0 0" }}>
      {extra?.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt style={muted}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </React.Fragment>
      ))}
      {orderedFigureKeys(figures).map((key) => {
        const figure = figures[key];
        return (
          <React.Fragment key={key}>
            <dt style={muted}>{FIGURE_LABELS[key]?.label ?? key}</dt>
            <dd style={{ margin: 0 }} title={[figure.source, figure.note].filter(Boolean).join(" · ") || undefined}>
              {formatFigure(key, figure, locale)}
              {figure.year ? <span style={muted}> ({figure.year})</span> : null}
            </dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

export function CountryCard({
  selection,
  sources,
  onClose,
  locale = "en-GB",
  className,
  style,
}: CountryCardProps): React.ReactElement | null {
  if (!selection) {return null;}

  let title: React.ReactNode;
  let name: string;
  let subtitle: React.ReactNode;
  let body: React.ReactNode;

  if (selection.kind === "country") {
    const { country, region } = selection;
    name = country.name;
    title = (
      <>
        {flagEmoji(country.iso2) && <span aria-hidden="true">{flagEmoji(country.iso2)} </span>}
        {country.name}
      </>
    );
    subtitle = [country.longName, region?.id, country.kind].filter(Boolean).join(" · ");
    const codes = [country.iso2, country.iso3, country.isoNumeric].filter(Boolean).join(" / ");
    body = (
      <FactRows
        figures={figuresOf(country)}
        locale={locale}
        extra={[
          ...(country.capital ? [["Capital", country.capital.name] as [string, React.ReactNode]] : []),
          ...(codes ? [["ISO codes", codes] as [string, React.ReactNode]] : []),
        ]}
      />
    );
  } else {
    const { region, scheme } = selection;
    name = region.id;
    title = region.id;
    subtitle = `${scheme.label} · ${region.countries.length} countries`;
    body = <FactRows figures={region.figures} locale={locale} />;
  }

  const credits = (sources ?? []).map((source) => (source.licence ? `${source.name} (${source.licence})` : source.name));

  return (
    <div
      className={className}
      style={{ font: "12px/1.5 sans-serif", minWidth: 220, ...style }}
      role="region"
      aria-label={name}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 15px/1.35 sans-serif" }}>{title}</div>
          {subtitle && <div style={muted}>{subtitle}</div>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", font: "16px/1 sans-serif" }}
          >
            ×
          </button>
        )}
      </div>
      {body}
      {credits.length > 0 && <div style={{ ...muted, marginTop: 8, fontSize: 11 }}>Sources: {credits.join(", ")}</div>}
    </div>
  );
}
