/**
 * The specimens: one live example per component, as data.
 *
 * WHY A LIST AND NOT A PAGE OF JSX
 * --------------------------------
 * Because a list can be compared with the package's exports and a page cannot.
 * `showcase.test.tsx` reads `../index.js`, takes every export that React would
 * call a component, and asserts it appears here — so adding a component and
 * forgetting the showcase fails the build, naming the component. A gallery
 * that silently omits four of thirty-four is worse than no gallery: the four
 * it leaves out are the four somebody rebuilds by hand, which is the failure
 * this library was assembled to end.
 *
 * WHAT A SPECIMEN IS FOR
 * ----------------------
 * A realistic smallest example — not an exhaustive prop matrix. The question
 * it answers is "does this exist, what is it called, and roughly what does it
 * look like", which is the question that was being answered wrongly. The props
 * are documented in TypeScript, which is in the editor already.
 *
 * `ComponentShowcase.tsx` renders these. It is a separate file so that each
 * exports one kind of thing — components there, data here — which is what fast
 * refresh needs and, as it happens, what makes the parity test readable.
 */

import React from "react";
import {
  AccordionSpecimen,
  CalendarSpecimen,
  FileDropSpecimen,
  KanbanSpecimen,
  MarkdownEditorSpecimen,
  PivotTableSpecimen,
  TreeTableSpecimen,
  VirtualTableSpecimen,
  AppShellSpecimen,
  ChatPanelSpecimen,
  ChoiceSpecimen,
  ContextMenuSpecimen,
  DataTableSpecimen,
  DateSpecimen,
  DialogSpecimen,
  DrawerSpecimen,
  EditableFieldSpecimen,
  FacetGroupSpecimen,
  FilterSummarySpecimen,
  MenuSpecimen,
  MultiSelectSpecimen,
  NumberInputSpecimen,
  PaginationSpecimen,
  PopoverSpecimen,
  SelectSpecimen,
  SliderSpecimen,
  SplitPaneSpecimen,
  TabsSpecimen,
  TextAreaSpecimen,
  TextInputSpecimen,
} from "./showcaseStates.js";
import { Avatar, AvatarGroup } from "./Avatar.js";
import { Banner } from "./Banner.js";
import { Button } from "./Button.js";
import { CopyButton, DownloadButton, RefreshButton } from "./ActionButtons.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { Field } from "./Field.js";
import { GanttChart } from "./GanttChart.js";
import { Icon, ICON_NAMES } from "./Icon.js";
import { Stepper } from "./Stepper.js";
import { Timeline } from "./Timeline.js";
import { ToastCard } from "./Toast.js";
import { AppBreadcrumb } from "./AppBreadcrumb.js";
import { Callout } from "./Callout.js";
import { Card } from "./Card.js";
import { CodeBlock } from "./CodeBlock.js";
import { DechoSurface } from "./DechoSurface.js";
import { DemoDataBadge } from "./DemoDataBadge.js";
import { EmptyState } from "./EmptyState.js";
import { KpiTile } from "./KpiTile.js";
import { Legend } from "./Legend.js";
import { MetricTile } from "./MetricTile.js";
import { NavItem } from "./NavItem.js";
import { Panel } from "./Panel.js";
import { ProgressBar } from "./ProgressBar.js";
import { SectionHeader } from "./SectionHeader.js";
import { SimpleMarkdown } from "./SimpleMarkdown.js";
import { Skeleton } from "./Skeleton.js";
import { StackedBar } from "./StackedBar.js";
import { StatusChip } from "./StatusChip.js";
import { StatusDot } from "./StatusDot.js";
import { Tag } from "./Tag.js";
import { Toolbar, ToolbarSpacer, ToolbarStatus } from "./Toolbar.js";
import { Tooltip } from "./Tooltip.js";
import { UserName } from "./UserName.js";
import {
  BarChart,
  ChartLegend,
  DonutChart,
  Sparkline,
  StatusHeatmap,
} from "./charts.js";

/**
 * The shelves.
 *
 * Written as a union and a list rather than derived from an `as const` array,
 * which is the usual trick: `export const SHOWCASE_GROUPS = […] as const` is
 * read by `react-refresh/only-export-components` as a *component* export —
 * the name matches its component pattern and the `as const` hides the array
 * from its "this is data" check — and the whole file then lints as a mixed
 * module. A union costs one duplicated list and keeps the warning honest.
 */
export type ShowcaseGroup =
  | "Content"
  | "Data"
  | "Charts"
  | "Structure"
  | "Overlays"
  | "Editorial"
  | "Shell"
  | "Theming"
  // The tier-two shelves. Separate from the others because these components
  // are heavy — a pivot engine, a virtualised table, a month grid — and the
  // gallery is split across two pages on that line.
  | "Grids"
  | "Planning"
  | "Media";

/** The shelves, in the order they are shown. */
export const SHOWCASE_GROUPS: readonly ShowcaseGroup[] = [
  "Content",
  "Data",
  "Charts",
  "Structure",
  "Overlays",
  "Editorial",
  "Shell",
  "Theming",
  "Grids",
  "Planning",
  "Media",
];

/**
 * The everyday shelves, and the heavyweight ones.
 *
 * Exported so an application can put them on separate pages, which is what
 * the harness does: `<ComponentShowcase groups={EVERYDAY_GROUPS} />` on one
 * route and `ADVANCED_GROUPS` on another. A pivot table and a Gantt chart
 * render a great deal more than a Tag, and somebody looking for a Tag should
 * not wait for them.
 */
export const EVERYDAY_GROUPS: readonly ShowcaseGroup[] = [
  "Content",
  "Data",
  "Charts",
  "Structure",
  "Overlays",
  "Editorial",
  "Shell",
  "Theming",
];

export const ADVANCED_GROUPS: readonly ShowcaseGroup[] = ["Grids", "Planning", "Media"];

export interface ShowcaseSpecimen {
  /** The exported name, exactly — this is what the parity test matches on. */
  name: string;
  group: ShowcaseGroup;
  /** One line: what it is for, in the terms someone searching would use. */
  description: string;
  /**
   * Other exports this same card demonstrates.
   *
   * `AppShell` is only meaningful with a header, a sidebar and a footer inside
   * it, and `ToolbarSpacer` renders nothing on its own. Splitting those into
   * cards of fragments would be a worse showcase, so they are declared as
   * covered here instead — and the parity test accepts that, which keeps it
   * honest either way.
   */
  also?: readonly string[];
  /** The live example. */
  render: () => React.ReactNode;
}

/* ==========================================================================
   The specimens
   ========================================================================== */

/** Every component in the library, with a live example of each. */
export const SHOWCASE_SPECIMENS: readonly ShowcaseSpecimen[] = [
  /* -- Content ----------------------------------------------------------- */
  {
    name: "Card",
    group: "Content",
    description: "A titled surface. The unit everything else sits in.",
    render: () => (
      <Card title="KNA1" meta="Customer master" actions={<Tag tone="success">Ready</Tag>}>
        184 fields · 12 rules
      </Card>
    ),
  },
  {
    name: "Tag",
    group: "Content",
    description: "A label in one of the six tones. Tinted, or solid.",
    render: () => (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Tag tone="accent">accent</Tag>
        <Tag tone="success" dot>
          success
        </Tag>
        <Tag tone="warning">warning</Tag>
        <Tag tone="danger" solid>
          danger
        </Tag>
        <Tag>neutral</Tag>
      </div>
    ),
  },
  {
    name: "StatusChip",
    group: "Content",
    description: "A RAG state, on the scale shared by every widget in the estate.",
    render: () => (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <StatusChip status="onTrack">On track</StatusChip>
        <StatusChip status="atRisk">At risk</StatusChip>
        <StatusChip status="critical" solid>
          Critical
        </StatusChip>
        <StatusChip status="notAssessed">Not assessed</StatusChip>
      </div>
    ),
  },
  {
    name: "StatusDot",
    group: "Content",
    description: "The same state where there is no room for a chip — with a label, never colour alone.",
    render: () => (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatusDot status="complete" label="Complete" />
        <StatusDot status="atRisk" label="At risk" halo />
        <StatusDot tone="info" label="Info" />
      </div>
    ),
  },
  {
    name: "Button",
    group: "Content",
    description: "Primary, default, ghost and danger — with real hover and focus states.",
    render: () => (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button variant="primary" size="sm">
          Primary
        </Button>
        <Button size="sm">Default</Button>
        <Button variant="ghost" size="sm">
          Ghost
        </Button>
        <Button variant="danger" size="sm">
          Delete
        </Button>
      </div>
    ),
  },
  {
    name: "Panel",
    group: "Content",
    description: "A card with a pinned header and a scrolling body. The map-overlay variant lives here too.",
    render: () => (
      <Panel title="Filters" actions={<Button variant="ghost" size="sm">Reset</Button>}>
        Body content, which scrolls while the header stays put.
      </Panel>
    ),
  },
  {
    name: "NavItem",
    group: "Content",
    description: "One row of a navigation list. A real button, with an active state.",
    render: () => (
      <div style={{ display: "grid", gap: 4 }}>
        <NavItem label="Readiness" description="38 objects" active />
        <NavItem label="Design" description="12 open questions" />
      </div>
    ),
  },
  {
    name: "SectionHeader",
    group: "Content",
    description: "A real heading element, an optional sentence, and actions on the right.",
    render: () => (
      <SectionHeader
        title="Data readiness"
        description="Per object, against the sign-off criteria."
        actions={<Button size="sm">Export</Button>}
        divider
      />
    ),
  },
  {
    name: "Callout",
    group: "Content",
    description: "A tinted note: what the user needs to know before reading on.",
    render: () => (
      <Callout tone="warning" title="Two objects unassessed">
        Nobody has looked at LFA1 or T001, which is a different fact from their
        having failed.
      </Callout>
    ),
  },
  {
    name: "EmptyState",
    group: "Content",
    description: "Nothing to show, said deliberately — and what to do about it.",
    render: () => (
      <EmptyState
        outlined
        title="No objects match"
        description="Clear a filter, or widen the workstream."
        action={<Button size="sm">Clear filters</Button>}
      />
    ),
  },
  {
    name: "Skeleton",
    group: "Content",
    description: "The shape of the content that is loading, rather than a spinner.",
    render: () => (
      <div style={{ display: "grid", gap: 8 }}>
        <Skeleton variant="text" lines={3} />
        <Skeleton variant="block" height={40} />
      </div>
    ),
  },
  {
    name: "Tooltip",
    group: "Content",
    description: "A hover and focus explanation, described to assistive technology.",
    render: () => (
      <Tooltip content="Objects signed off by the business owner.">
        <Button size="sm">Signed off</Button>
      </Tooltip>
    ),
  },

  /* -- Data -------------------------------------------------------------- */
  {
    name: "MetricTile",
    group: "Data",
    description: "One number with a label. The tile every dashboard in the estate rebuilt.",
    render: () => (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <MetricTile label="Objects" value="49" note="+4 this week" />
        <MetricTile label="At risk" value="9" tone="warning" />
      </div>
    ),
  },
  {
    name: "KpiTile",
    group: "Data",
    description: "A metric with an icon, and optionally a click — the selectable filter tile.",
    render: () => (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <KpiTile label="Fields mapped" value="1,204" icon="→" tone="success" />
        <KpiTile label="Open questions" value="12" tone="danger" compact />
      </div>
    ),
  },
  {
    name: "ProgressBar",
    group: "Data",
    description: "A share of a whole, with the figure as text as well as a width.",
    render: () => (
      <div style={{ display: "grid", gap: 10 }}>
        <ProgressBar value={72} label="Mapped" />
        <ProgressBar value={31} label="Validated" status="atRisk" size="lg" emphasis="headline" />
        <ProgressBar value={0} label="Loading" indeterminate />
      </div>
    ),
  },
  {
    name: "StackedBar",
    group: "Data",
    description: "A composition — one bar, several states, a legend under it.",
    render: () => (
      <StackedBar
        segments={[
          { label: "Complete", value: 24, status: "complete" },
          { label: "On track", value: 14, status: "onTrack" },
          { label: "At risk", value: 9, status: "atRisk" },
          { label: "Critical", value: 2, status: "critical" },
        ]}
        legend
      />
    ),
  },
  {
    name: "Legend",
    group: "Data",
    description: "What the colours mean, optionally clickable to filter.",
    render: () => (
      <Legend
        items={[
          { label: "Complete", status: "complete", value: 24 },
          { label: "On track", status: "onTrack", value: 14 },
          { label: "At risk", status: "atRisk", value: 9 },
        ]}
        direction="column"
      />
    ),
  },
  {
    name: "DataTable",
    group: "Data",
    description: "Sorting, selection, sticky header, loading and empty states — as one component.",
    render: () => <DataTableSpecimen />,
  },

  /* -- Charts ------------------------------------------------------------ */
  {
    name: "Sparkline",
    group: "Charts",
    description: "A trend, inline, with no charting dependency.",
    render: () => <Sparkline values={[4, 9, 7, 12, 18, 16, 24, 31]} area width={260} height={52} />,
  },
  {
    name: "BarChart",
    group: "Charts",
    description: "Categories, vertical or horizontal, coloured from the theme's series.",
    render: () => (
      <BarChart
        data={[
          { label: "Finance", value: 18 },
          { label: "Supply", value: 12 },
          { label: "HR", value: 7 },
          { label: "Sales", value: 4 },
        ]}
        height={140}
        showValues
      />
    ),
  },
  {
    name: "DonutChart",
    group: "Charts",
    description: "A composition, with room in the middle for the number that matters.",
    render: () => (
      <DonutChart
        data={[
          { label: "Mapped", value: 72 },
          { label: "Outstanding", value: 28 },
        ]}
        size={140}
        centre={<strong>72%</strong>}
      />
    ),
  },
  {
    name: "ChartLegend",
    group: "Charts",
    description: "The series legend a chart cannot be read without.",
    render: () => (
      <ChartLegend
        items={[
          { label: "Mapped", value: "72%" },
          { label: "Outstanding", value: "28%" },
        ]}
      />
    ),
  },
  {
    name: "StatusHeatmap",
    group: "Charts",
    description: "A grid of RAG states — the fixed scale, never the six tones.",
    render: () => (
      <StatusHeatmap
        columns={["W1", "W2", "W3", "W4"]}
        rows={[
          { label: "KNA1", cells: ["complete", "complete", "onTrack", "onTrack"] },
          { label: "MARA", cells: ["onTrack", "atRisk", "atRisk", "critical"] },
          { label: "LFA1", cells: ["notAssessed", "notAssessed", undefined, "noData"] },
        ]}
      />
    ),
  },

  /* -- Structure --------------------------------------------------------- */
  {
    name: "Tabs",
    group: "Structure",
    description: "Underline or segmented, with the ARIA a tab list owes a keyboard.",
    render: () => <TabsSpecimen />,
  },
  {
    name: "Toolbar",
    group: "Structure",
    description: "The row of controls above a view.",
    also: ["ToolbarSpacer", "ToolbarStatus"],
    render: () => (
      <Toolbar label="Table controls">
        <Button size="sm">Filter</Button>
        <Button size="sm">Group</Button>
        <ToolbarSpacer />
        <ToolbarStatus>49 objects</ToolbarStatus>
      </Toolbar>
    ),
  },
  {
    name: "FacetGroup",
    group: "Structure",
    description: "Filter chips with counts — single or multiple select, clearable.",
    render: () => <FacetGroupSpecimen />,
  },

  /* -- Overlays ---------------------------------------------------------- */
  {
    name: "Dialog",
    group: "Overlays",
    description: "A modal with a focus trap, Escape to close and a described title.",
    render: () => <DialogSpecimen />,
  },
  {
    name: "Drawer",
    group: "Overlays",
    description: "The detail panel: a record, beside the list it came from.",
    render: () => <DrawerSpecimen />,
  },

  /* -- Editorial --------------------------------------------------------- */
  {
    name: "SimpleMarkdown",
    group: "Editorial",
    description: "Headings, lists, links, code and bold — without a markdown dependency.",
    render: () => (
      <SimpleMarkdown>
        {"**Two** objects are unassessed:\n\n- LFA1\n- T001\n\nNeither has an owner."}
      </SimpleMarkdown>
    ),
  },
  {
    name: "ChatPanel",
    group: "Editorial",
    description: "A transcript and a composer, for an AIP-backed answer in a widget.",
    render: () => <ChatPanelSpecimen />,
  },
  {
    name: "CodeBlock",
    group: "Editorial",
    description: "Monospaced, scrollable, copyable.",
    render: () => <CodeBlock label="install" code={'npm install @acc/decho-components'} />,
  },
  {
    name: "EditableField",
    group: "Editorial",
    description: "Read until clicked, then an input with validation and an explicit commit.",
    render: () => <EditableFieldSpecimen />,
  },
  {
    name: "UserName",
    group: "Editorial",
    description: "A person: initials, name and a loading state for the lookup.",
    render: () => (
      <div style={{ display: "grid", gap: 8 }}>
        <UserName name="Dana Okafor" meta="Finance workstream" />
        <UserName loading />
      </div>
    ),
  },
  {
    name: "DemoDataBadge",
    group: "Editorial",
    description: "Says, unmissably, that what is on screen is not real data.",
    render: () => <DemoDataBadge reason="No object set is configured on this widget." />,
  },

  /* -- Shell ------------------------------------------------------------- */
  {
    name: "AppShell",
    group: "Shell",
    description: "The whole page: header, sidebar, content and footer, as one layout.",
    also: ["AppHeader", "AppBody", "AppSidebar", "AppSidebarNav", "AppContent", "AppFooter"],
    render: () => <AppShellSpecimen />,
  },
  {
    name: "AppBreadcrumb",
    group: "Shell",
    description: "Where this page sits, and the way back up.",
    render: () => (
      <AppBreadcrumb
        items={[
          { label: "Programme", href: "#" },
          { label: "Finance", href: "#" },
          { label: "KNA1" },
        ]}
      />
    ),
  },

  /* -- Theming ----------------------------------------------------------- */
  {
    name: "DechoSurface",
    group: "Theming",
    description:
      "The only thing resembling a provider: declares a token set, and everything below follows.",
    render: () => (
      <DechoSurface surface style={{ padding: 12, display: "grid", gap: 8 }}>
        <span>Inside a surface, with the theme it was given.</span>
        <div style={{ display: "flex", gap: 6 }}>
          <Tag tone="accent">accent</Tag>
          <Button size="sm" variant="primary">
            Primary
          </Button>
        </div>
      </DechoSurface>
    ),
  },

  /* -- Tier one (0.3.0) -------------------------------------------------
     Inputs, overlays, structure and the small utilities. Same rule as
     everything above: a realistic smallest example, not a prop matrix. */
  {
    name: "TextInput",
    group: "Content",
    description: "A themed, labelled, described text field. With an icon, a clear button and errors.",
    render: () => <TextInputSpecimen />,
  },
  {
    name: "TextArea",
    group: "Content",
    description: "Multi-line, with a character counter that assistive technology also reads.",
    render: () => <TextAreaSpecimen />,
  },
  {
    name: "NumberInput",
    group: "Data",
    description: "A number field the scroll wheel cannot silently edit. Units, steppers, bounds.",
    render: () => <NumberInputSpecimen />,
  },
  {
    name: "Field",
    group: "Content",
    description: "Label, hint, error and the aria-describedby wiring — for any control.",
    render: () => (
      <Field label="Centre" hint="Decimal degrees, WGS 84">
        {(aria) => <input {...aria} defaultValue="51.5072, -0.1276" style={{ width: "100%" }} />}
      </Field>
    ),
  },
  {
    name: "Checkbox",
    group: "Content",
    description: "A real checkbox, themed, with the third state for partial selections.",
    also: ["RadioGroup", "Toggle"],
    render: () => <ChoiceSpecimen />,
  },
  {
    name: "Select",
    group: "Content",
    description: "The dropdown a native <select> cannot be: themed, grouped, searchable.",
    render: () => <SelectSpecimen />,
  },
  {
    name: "MultiSelect",
    group: "Content",
    description: "Several answers, summarised on the trigger, with select-all.",
    render: () => <MultiSelectSpecimen />,
  },
  {
    name: "Slider",
    group: "Data",
    description: "One handle or two, keyboard-operable, snapped to the step.",
    also: ["RangeSlider"],
    render: () => <SliderSpecimen />,
  },
  {
    name: "Popover",
    group: "Overlays",
    description: "An anchored panel that flips and clamps. What Select, Menu and the filters are built on.",
    render: () => <PopoverSpecimen />,
  },
  {
    name: "Menu",
    group: "Overlays",
    description: "The ⋯ menu: icons, shortcuts, tones, separators, and arrow-key navigation.",
    render: () => <MenuSpecimen />,
  },
  {
    name: "ContextMenu",
    group: "Overlays",
    description: "Right-click, and Shift+F10 for anyone without a mouse.",
    render: () => <ContextMenuSpecimen />,
  },
  {
    name: "ToastCard",
    group: "Overlays",
    description: "Action feedback. Failures do not auto-dismiss; repeats collapse with a count.",
    also: ["ToastHost", "useToast"],
    render: () => (
      <div style={{ display: "grid", gap: 8 }}>
        <ToastCard toast={{ id: "1", message: "Sign-off saved", tone: "success" }} onDismiss={() => {}} />
        <ToastCard
          toast={{
            id: "2",
            message: "Could not save 3 of 12 objects",
            tone: "danger",
            count: 3,
            action: { label: "Retry", onClick: () => {} },
          }}
          onDismiss={() => {}}
        />
      </div>
    ),
  },
  {
    name: "Banner",
    group: "Content",
    description: "The page-level failure surface, with a copyable diagnostic behind a disclosure.",
    render: () => (
      <Banner
        tone="danger"
        title="The last refresh failed"
        diagnostic="request-id: 7f3c-91ab-2e04\nstatus: 502"
        actions={<Button size="sm">Retry</Button>}
      >
        The figures below are from 09:14 and may be out of date.
      </Banner>
    ),
  },
  {
    name: "ErrorBoundary",
    group: "Theming",
    description: "A render error becomes a banner instead of an empty widget.",
    render: () => (
      <ErrorBoundary label="Readiness table">
        <span>Renders its children while they render.</span>
      </ErrorBoundary>
    ),
  },
  {
    name: "Accordion",
    group: "Structure",
    description: "Collapsible sections. Closed ones are unmounted, not merely hidden.",
    render: () => <AccordionSpecimen />,
  },
  {
    name: "SplitPane",
    group: "Structure",
    description: "List beside detail, with a divider a keyboard can move.",
    render: () => <SplitPaneSpecimen />,
  },
  {
    name: "Stepper",
    group: "Structure",
    description: "Where you are in a flow, with each state in words as well as in colour.",
    render: () => (
      <Stepper
        current={1}
        steps={[
          { key: "design", label: "Design", description: "12 questions" },
          { key: "load", label: "Load" },
          { key: "ready", label: "Readiness" },
          { key: "signoff", label: "Sign-off" },
        ]}
      />
    ),
  },
  {
    name: "Pagination",
    group: "Data",
    description: "Pages, page sizes and a live summary — or a load-more for a feed.",
    also: ["LoadMore"],
    render: () => <PaginationSpecimen />,
  },
  {
    name: "Timeline",
    group: "Data",
    description: "An event feed with exact timestamps and human labels.",
    render: () => (
      <Timeline
        events={[
          {
            key: "1",
            title: "Signed off by Dana Okafor",
            at: "2026-03-01T09:14:00Z",
            when: "2 hours ago",
            icon: "check",
            tone: "success",
          },
          {
            key: "2",
            title: "Readiness fell to 68%",
            at: "2026-02-28T16:02:00Z",
            when: "yesterday",
            icon: "warning",
            tone: "warning",
            body: "Four fields lost their mapping in the last load.",
          },
        ]}
      />
    ),
  },
  {
    name: "DateInput",
    group: "Content",
    description: "A date, as an ISO string rather than a Date — so it cannot be a day out.",
    also: ["DateRangeInput"],
    render: () => <DateSpecimen />,
  },
  {
    name: "Avatar",
    group: "Editorial",
    description: "A person, with initials that are not just the first two letters.",
    also: ["AvatarGroup"],
    render: () => (
      <div style={{ display: "grid", gap: 10 }}>
        <Avatar name="Dana Okafor" size={32} />
        <AvatarGroup
          people={[
            { name: "Dana Okafor" },
            { name: "Maria del Carmen Rodríguez" },
            { name: "Ludwig van Beethoven" },
            { name: "Jae Park" },
            { name: "Sam Patel" },
          ]}
          max={3}
        />
      </div>
    ),
  },
  {
    name: "CopyButton",
    group: "Editorial",
    description: "Copy, with a confirmation a screen reader also gets.",
    also: ["DownloadButton", "RefreshButton"],
    render: () => (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <CopyButton value="7f3c-91ab-2e04" what="request id" />
        <DownloadButton onDownload={() => {}} />
        <RefreshButton onRefresh={() => {}} lastUpdated="09:14" />
      </div>
    ),
  },
  {
    name: "FilterSummary",
    group: "Structure",
    description: "The answer to “why am I seeing twelve rows”.",
    render: () => <FilterSummarySpecimen />,
  },
  {
    name: "Icon",
    group: "Theming",
    description: "The small closed glyph set the components themselves need.",
    render: () => (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} size={16} label={name} />
        ))}
      </div>
    ),
  },

  /* -- Tier two (0.4.0) -------------------------------------------------
     The heavyweight components, on their own shelves so the harness can put
     them on a second page. Each carries more data than the tier-one
     specimens: a virtualised table with six rows proves nothing. */
  {
    name: "DataTable",
    group: "Grids",
    description: "Virtualised: 800 rows, about twenty in the DOM, with aria-rowcount so the count is still announced.",
    also: ["virtualRange"],
    render: () => <VirtualTableSpecimen />,
  },
  {
    name: "PivotTable",
    group: "Grids",
    description: "A crosstab with totals that come from the raw values — never an average of averages.",
    render: () => <PivotTableSpecimen />,
  },
  {
    name: "TreeTable",
    group: "Grids",
    description: "A treegrid: nesting with columns, Right to open and step in, Left to close and step out.",
    render: () => <TreeTableSpecimen />,
  },
  {
    name: "KanbanBoard",
    group: "Planning",
    description: "Drag a card, or move it with ctrl and the arrow keys — no drag-and-drop dependency.",
    render: () => <KanbanSpecimen />,
  },
  {
    name: "GanttChart",
    group: "Planning",
    description: "A plan to read: inclusive dates, clipping arrows, a today line and a text alternative per row.",
    render: () => (
      <GanttChart
        today="2026-03-17"
        from="2026-03-01"
        to="2026-04-15"
        tasks={[
          { id: "1", label: "Design freeze", start: "2026-03-02", end: "2026-03-06", progress: 100, status: "complete" },
          { id: "2", label: "Data load", start: "2026-03-09", end: "2026-03-20", progress: 60, status: "onTrack", depth: 1 },
          { id: "3", label: "Reconciliation", start: "2026-03-16", end: "2026-03-27", progress: 20, status: "atRisk", depth: 1 },
          { id: "4", label: "Cutover", start: "2026-03-23", end: "2026-03-23", milestone: true, status: "critical" },
          { id: "5", label: "Hypercare", start: "2026-03-24", end: "2026-05-30", status: "notAssessed" },
        ]}
      />
    ),
  },
  {
    name: "Calendar",
    group: "Planning",
    description: "A month with events on it, locale-aware week start, arrow keys that page across months.",
    render: () => <CalendarSpecimen />,
  },
  {
    name: "FileDrop",
    group: "Media",
    description: "A drop zone that is also a real file input, with rejections said out loud and in numbers.",
    also: ["ImageGallery"],
    render: () => <FileDropSpecimen />,
  },
  {
    name: "MarkdownEditor",
    group: "Media",
    description: "The answer to “we need a rich text editor”: a textarea, a toolbar and a preview — no contentEditable.",
    render: () => <MarkdownEditorSpecimen />,
  },
];
