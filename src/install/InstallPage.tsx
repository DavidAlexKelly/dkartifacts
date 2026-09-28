/**
 * How to install these packages somewhere else, and what to type once you have.
 *
 * WHY A PAGE AND NOT A README
 * ---------------------------
 * The READMEs are good and nobody reads them at the right moment. The moment
 * that matters is "someone has been shown a demo and wants this in their repo",
 * and at that moment they have a browser open on this app, not a clone of it.
 * So the guide lives next to the thing it is selling, and the facts most likely
 * to rot — version, peers, subpaths, which Artifacts repository — are read from
 * the package manifests rather than retyped (see `guides.ts`).
 *
 * WHAT IT DELIBERATELY LEADS WITH
 * -------------------------------
 * The Libraries panel, with screenshots, because the install is mostly a UI
 * flow and only ends in a command. Written out as prose it sounds like four
 * trivial steps; in practice people go to Settings (the wrong Libraries),
 * install from the terminal first (404), or cancel the dialog that adds the
 * backing repository (also 404, one step later). Pictures are the honest
 * format for that, and the error it prevents is the single most common
 * question this repo gets.
 */

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  tokensFor,
  type DechoSkin,
} from "@acc/decho-styling";
import {
  Button,
  Card,
  CodeBlock,
  DechoSurface,
  Panel,
  Tag,
  monoStyle,
} from "@acc/decho-components";
import {
  PACKAGE_GUIDES,
  REGISTRIES,
  guideFor,
  installFlow,
} from "@/install/guides";

/** The whole page is one theme; the switcher lives on /styling. */
const SKIN: DechoSkin = "modern";

/**
 * Things that go wrong, and what they actually mean.
 *
 * Every one of these cost somebody an afternoon. They are phrased symptom-first
 * because that is what the reader has in front of them — nobody searches for
 * "project imports", they search for the error.
 */
const TROUBLE: { symptom: string; meaning: string }[] = [
  {
    symptom: "npm install → 404 Not Found",
    meaning:
      "The backing repository was never added — step 2 was cancelled, or the package was installed from the terminal without going through the Libraries panel first. Nothing in the error mentions this.",
  },
  {
    symptom: "npm install → 403 Forbidden",
    meaning:
      "The repository is backing the workspace but you are not permitted to it. A permissions request on the Artifacts repository, not a code change.",
  },
  {
    symptom: "A package resolves to the wrong thing",
    meaning:
      "Backing repositories resolve top to bottom and external-npm-npmjs is above the internal ones. Settings → Libraries → Fix order.",
  },
  {
    symptom: "ENOTFOUND accenture.palantirfoundry.com",
    meaning:
      "Something is pointing npm at the public host from inside a Code Workspace, where it does not resolve — usually the instructions on the Artifacts repository's own Publish tab, which are written for a laptop. The Libraries panel flow above needs no host at all.",
  },
  {
    symptom: "Found: @osdk/client@undefined",
    meaning:
      "A --registry override is sending every package at the Artifacts repository, including ones that do not live there. Drop the flag: once the library is added, plain npm install works.",
  },
  {
    symptom: "403 from a dataset at runtime, after installing fine",
    meaning:
      "Developer Console → your app → Resources does not list the dataset. The api:use-datasets-read scope on its own is not enough.",
  },
  {
    symptom: "A version you just published does not install",
    meaning:
      "npm is serving a cached packument. npm cache clean --force, then install with --prefer-online.",
  },
];

function InstallPage(): React.ReactElement {
  // The selection lives in the URL so the page can be linked to already on the
  // right package — /install?package=@acc/decho-styling, which is what the
  // button on the design system's own page uses. A link to "the install page"
  // that lands on somebody else's package is a link people stop sending.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requested = params.get("package");
  const known = PACKAGE_GUIDES.some((guide) => guide.name === requested);
  const guide = guideFor(known && requested != null ? requested : PACKAGE_GUIDES[0].name);
  const t = tokensFor(SKIN);

  const select = (name: string) => {
    // replace, not push: flicking through seven packages should not put seven
    // entries between the reader and the page they arrived from.
    setParams({ package: name }, { replace: true });
  };

  return (
    <DechoSurface tokens={t} filled style={page}>
      <div>
        <h1 style={{ margin: 0, fontSize: t.fontSize["2xl"], fontWeight: 600 }}>
          Install &amp; use
        </h1>
        <p style={{ margin: "4px 0 0", color: t.color.textMuted, fontSize: t.fontSize.sm }}>
          Getting any of these packages into another Foundry code repository.
          Pick one — the commands, the peers and the platform access below all
          change with it.
        </p>
      </div>

      {/* ── The picker ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PACKAGE_GUIDES.map((option) => (
          <Button
            key={option.name}
            variant={option.name === guide.name ? "primary" : "default"}
            onClick={() => select(option.name)}
            title={option.summary}
          >
            {option.name.replace("@acc/", "")}
          </Button>
        ))}
      </div>

      {/* ── What you are installing ────────────────────────────────────── */}
      <Panel
        title={guide.name}
        actions={<Tag tone="accent">{guide.version}</Tag>}
      >
        <p style={{ margin: 0, fontSize: t.fontSize.md }}>{guide.summary}</p>

        <div style={{ ...sectionLabel(t), marginTop: 12 }}>Published subpaths</div>
        <div style={row}>
          {guide.subpaths.map((subpath) => (
            <Tag key={subpath} tone="neutral">
              {subpath}
            </Tag>
          ))}
        </div>

        {guide.examplePath != null && (
          <div style={{ marginTop: 12 }}>
            <Button size="sm" onClick={() => navigate(guide.examplePath as string)}>
              See it running in this app ›
            </Button>
          </div>
        )}
      </Panel>

      {/* ── 1–4: the install itself ────────────────────────────────────── */}
      {installFlow(guide).map((step, index) => (
        <Step key={step.title} n={index + 1} title={step.title} note={step.note}>
          {step.code != null && (
            <CodeBlock tokens={t} code={step.code} label={step.title} />
          )}
          {step.image != null && (
            <figure style={figure(t)}>
              {/* The bundler's URL, not a hand-written one: the base path in a
                  Code Workspace has no trailing slash, which made the obvious
                  BASE_URL concatenation 404. */}
              <img src={step.image.src} alt={step.image.alt} style={screenshot(t)} />
              <figcaption style={{ ...note(t), marginTop: 6 }}>
                Shown while installing <code style={monoStyle({ tokens: tokensFor(SKIN) })}>
                  @acc/decho-styling
                </code>
                . Every step is the same for the other packages — only the
                repository named in step 2 differs.
              </figcaption>
            </figure>
          )}

          {/* Hung off step 2, where the dialog names the repository: the
              obvious question at that moment is "which one is mine, and why
              are there two?". */}
          {index === 1 && (
            <div style={grid}>
              {REGISTRIES.map((registry) => (
                <Card
                  key={registry.rid}
                  title={registry.holds}
                  meta={registry.rid}
                  tone={registry.rid === guide.registryRid ? "accent" : "neutral"}
                  actions={
                    registry.rid === guide.registryRid ? (
                      <Tag tone="accent">serves {guide.name}</Tag>
                    ) : undefined
                  }
                >
                  {registry.why}
                </Card>
              ))}
            </div>
          )}

          {index === 3 && guide.peers.length > 0 && (
            <>
              <p style={note(t)}>
                Peer dependencies are not installed for you. This package
                expects {guide.peers.length === 1 ? "one" : guide.peers.length}{" "}
                — install only those you actually pull in, since several are
                needed by one subpath each.
              </p>
              <CodeBlock
                tokens={t}
                code={`npm install ${guide.peers.join(" ")}`}
                label="the peer dependencies"
              />
            </>
          )}
        </Step>
      ))}

      {/* ── 5 ──────────────────────────────────────────────────────────── */}
      <Step
        n={5}
        title="Platform access"
        note="Installing a package is not the same as being allowed to read what it reads."
      >
        {guide.platform == null ? (
          <Card title="Nothing to configure" tone="success">
            This package touches no platform API — it is geometry, styling and
            markup. It works offline, in a test, and in a repository with no
            Developer Console application at all.
          </Card>
        ) : (
          <Card title="Developer Console → your app → Resources" tone="warning">
            {guide.platform}
          </Card>
        )}
      </Step>

      {/* ── 6 ──────────────────────────────────────────────────────────── */}
      <Step
        n={6}
        title="Use it"
        note="The smallest honest example — the same specifiers this app imports on the other pages."
      >
        {guide.usage.map((step) => (
          <div key={step.title} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: t.fontSize.lg, fontWeight: 600 }}>{step.title}</div>
            <div style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
              {step.note}
            </div>
            <CodeBlock tokens={t} code={step.code} label={step.title} />
          </div>
        ))}
      </Step>

      {/* ── 7 ──────────────────────────────────────────────────────────── */}
      <Step
        n={7}
        title="When it does not work"
        note="Symptom first, because that is what you have in front of you."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TROUBLE.map((item) => (
            <div key={item.symptom} style={trouble(t)}>
              <code style={{ ...monoStyle({ tokens: tokensFor(SKIN) }), color: t.color.danger }}>
                {item.symptom}
              </code>
              <span style={{ fontSize: t.fontSize.md }}>{item.meaning}</span>
            </div>
          ))}
        </div>
      </Step>
    </DechoSurface>
  );
}

function Step({
  n,
  title,
  note: text,
  children,
}: {
  n: number;
  title: string;
  note: string;
  children: React.ReactNode;
}): React.ReactElement {
  const t = tokensFor(SKIN);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: t.fontSize.xl, fontWeight: 600 }}>
          {n} · {title}
        </h2>
        <p style={{ margin: "2px 0 0", color: t.color.textMuted, fontSize: t.fontSize.sm }}>
          {text}
        </p>
      </div>
      {children}
    </section>
  );
}

type Tokens = ReturnType<typeof tokensFor>;

const note = (t: Tokens): React.CSSProperties => ({
  margin: 0,
  fontSize: t.fontSize.sm,
  color: t.color.textMuted,
});

const sectionLabel = (t: Tokens): React.CSSProperties => ({
  fontSize: t.fontSize.sm,
  color: t.color.textFaint,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
});

const figure = (t: Tokens): React.CSSProperties => ({
  margin: 0,
  padding: 10,
  background: t.color.bg,
  border: `1px solid ${t.color.borderSubtle}`,
  borderRadius: t.radius.md,
});

const screenshot = (t: Tokens): React.CSSProperties => ({
  display: "block",
  // The captures are wider than the column on a laptop, and a screenshot of a
  // dialog is unreadable once it is scaled past about this: cap it and let the
  // rest of the row breathe rather than blowing it up to the full width.
  maxWidth: "min(100%, 720px)",
  height: "auto",
  borderRadius: t.radius.sm,
  border: `1px solid ${t.color.borderSubtle}`,
});

const trouble = (t: Tokens): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "minmax(200px, 300px) 1fr",
  gap: 12,
  alignItems: "baseline",
  paddingBottom: 8,
  borderBottom: `1px solid ${t.color.borderSubtle}`,
});

const page: React.CSSProperties = {
  height: "100%",
  overflow: "auto",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 28,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
};

export default InstallPage;
