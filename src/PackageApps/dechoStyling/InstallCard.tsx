/**
 * How to use the selected theme, once the package is installed.
 *
 * The steps change with the theme — the class name, the `skin` prop and the
 * `tokensFor()` argument all carry it — so the panel is rendered from the
 * current selection rather than written out once in a README nobody has open
 * while they are wiring a widget.
 *
 * Installing is deliberately NOT here any more. It is a four-step UI flow in
 * the Libraries panel that wants screenshots to be followed correctly, it is
 * identical for all seven packages in this repo, and it does not change with
 * the skin — so it lives on /install, and this panel links to it rather than
 * keeping a second, shorter, eventually-wrong copy. It had one: it told people
 * to add a RID under Settings and then install with a --registry override,
 * which is the slow way round and fails differently at every step.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, CodeBlock, Panel, Tag } from "@acc/decho-components";
import {
  tokensFor,
  type DechoSkin,
} from "@acc/decho-styling";

export interface InstallCardProps {
  skin: DechoSkin;
}

export function InstallCard({ skin }: InstallCardProps): React.ReactElement {
  const t = tokensFor(skin);
  const navigate = useNavigate();
  const cssClass = skin === "classic" ? "decho-root" : `decho-root decho-${skin}`;

  const steps: { title: string; note: string; code: string }[] = [
    {
      title: "Components — no stylesheet needed",
      note: "The components are styled inline from the tokens, so nothing has to survive your bundler. This is the path that cannot fail in a widget.",
      code: [
        'import { AppShell, Card, Tag } from "@acc/decho-components";',
        "",
        'import { tokensFor } from "@acc/decho-styling";',
        "",
        `<AppShell tokens={tokensFor("${skin}")}>`,
        '  <Card title="Ready" actions={<Tag tone="success">Live</Tag>} />',
        "</AppShell>",
      ].join("\n"),
    },
    {
      title: "Or CSS classes",
      note: "Import the stylesheet once, then put the theme class on your outermost element. Never on :root — a widget shares its page.",
      code: [
        'import "@acc/decho-styling/tokens.css";',
        'import "@acc/decho-components/styles.css";',
        "",
        `<div className="${cssClass}">`,
        '  <article className="decho-card">…</article>',
        "</div>",
      ].join("\n"),
    },
    {
      title: "Or tokens, for inline styles",
      note: "Same values as both of the above. Use these when styling elements you already have — or anything that cannot read a CSS variable, like a map or canvas layer.",
      code: [
        'import { tokensFor, chartSeries } from "@acc/decho-styling";',
        "",
        `const t = tokensFor("${skin}");`,
        "t.color.accent    // " + t.color.accent,
        "t.radius.lg       // " + t.radius.lg,
        "chartSeries(0)    // " + tokensFor(skin).chart.series1,
      ].join("\n"),
    },
  ];

  return (
    <Panel
      title="Use this theme in a code repo"
      actions={
        <>
          <Tag tone="accent">{skin}</Tag>
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate("/install?package=@acc/decho-styling")}
          >
            How to install ›
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: t.fontSize.sm, color: t.color.textMuted }}>
          Already installed? Here is the theme you are looking at, three ways.
          If not, <strong>How to install</strong> above is the four-step flow in
          the Libraries panel, with screenshots.
        </p>

        {steps.map((step) => (
          <div key={step.title} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: t.fontSize.lg, fontWeight: 600 }}>{step.title}</div>
            <div style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
              {step.note}
            </div>
            <CodeBlock tokens={tokensFor(skin)} code={step.code} label={step.title} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
