/**
 * The specimens that have state of their own.
 *
 * A dialog that opens, a table that sorts, a field that commits: showing these
 * as a screenshot of their resting state would be showing the least
 * interesting half. Each is a small component rather than a hook used in the
 * grid, so that a specimen's state belongs to that specimen — one open dialog
 * must not re-render forty cards.
 *
 * Separate from `showcaseSpecimens.tsx` because that file exports data and
 * this one exports components, and a file that does both is a file fast
 * refresh gives up on.
 */

import React from "react";
import { resolveTokens, type DechoTone } from "../core/vars.js";
import { Calendar } from "./Calendar.js";
import { FileDrop, ImageGallery } from "./FileDrop.js";
import { KanbanBoard } from "./KanbanBoard.js";
import { MarkdownEditor } from "./MarkdownEditor.js";
import { PivotTable } from "./PivotTable.js";
import { TreeTable } from "./TreeTable.js";
import { describeFile } from "./fileValidation.js";
import type { Board } from "./kanban.js";
import type { TreeNode } from "./tree.js";
import { Accordion } from "./Accordion.js";
import { FilterSummary } from "./ActionButtons.js";
import { Checkbox } from "./Checkbox.js";
import { ContextMenu } from "./ContextMenu.js";
import { DateInput, DateRangeInput } from "./DateInput.js";
import { Icon } from "./Icon.js";
import { Menu } from "./Menu.js";
import { MultiSelect } from "./MultiSelect.js";
import { NumberInput } from "./NumberInput.js";
import { LoadMore, Pagination } from "./Pagination.js";
import { Popover } from "./Popover.js";
import { RadioGroup } from "./RadioGroup.js";
import { Select } from "./Select.js";
import { RangeSlider, Slider } from "./Slider.js";
import { SplitPane } from "./SplitPane.js";
import { TextArea } from "./TextArea.js";
import { TextInput } from "./TextInput.js";
import { Toggle } from "./Toggle.js";
import { AppBody, AppContent } from "./AppContent.js";
import { AppFooter } from "./AppFooter.js";
import { AppHeader } from "./AppHeader.js";
import { AppShell } from "./AppShell.js";
import { AppSidebar } from "./AppSidebar.js";
import { AppSidebarNav } from "./AppSidebarNav.js";
import { Button } from "./Button.js";
import { ChatPanel, type ChatMessage } from "./ChatPanel.js";
import { DataTable, type DataTableSort } from "./DataTable.js";
import { Dialog } from "./Dialog.js";
import { Drawer } from "./Drawer.js";
import { EditableField } from "./EditableField.js";
import { FacetGroup } from "./FacetGroup.js";
import { SectionHeader } from "./SectionHeader.js";
import { Tabs } from "./Tabs.js";
import { Tag } from "./Tag.js";

export function DialogSpecimen(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reassign 3 objects"
        description="They move to the Finance workstream. Their readiness scores are kept."
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              Reassign
            </Button>
          </>
        }
      >
        Objects already signed off stay signed off.
      </Dialog>
    </>
  );
}

export function DrawerSpecimen(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="KNA1 — Customer master"
        meta="SAP ECC · 412,908 rows"
        actions={<Tag tone="success">Signed off</Tag>}
      >
        <p style={{ margin: 0 }}>
          The detail panel pattern: a row stays selected in the table behind
          while its record is read here.
        </p>
      </Drawer>
    </>
  );
}

export function TabsSpecimen(): React.ReactElement {
  const [key, setKey] = React.useState("fields");
  return (
    <Tabs
      items={[
        { key: "fields", label: "Fields", badge: 24 },
        { key: "rules", label: "Rules", badge: 6 },
        { key: "history", label: "History" },
      ]}
      activeKey={key}
      onSelect={setKey}
    />
  );
}

export function FacetGroupSpecimen(): React.ReactElement {
  const [selected, setSelected] = React.useState<string[]>(["at-risk"]);
  return (
    <FacetGroup
      label="Readiness"
      facets={[
        { value: "on-track", label: "On track", count: 38 },
        { value: "at-risk", label: "At risk", count: 9 },
        { value: "critical", label: "Critical", count: 2 },
      ]}
      selected={selected}
      onChange={setSelected}
      multiple
      clearable
    />
  );
}

interface ShowcaseRow {
  id: string;
  object: string;
  owner: string;
  fields: number;
}

const TABLE_ROWS: ShowcaseRow[] = [
  { id: "kna1", object: "KNA1", owner: "Finance", fields: 184 },
  { id: "mara", object: "MARA", owner: "Supply chain", fields: 271 },
  { id: "lfa1", object: "LFA1", owner: "Procurement", fields: 96 },
];

export function DataTableSpecimen(): React.ReactElement {
  const [sort, setSort] = React.useState<DataTableSort | null>({
    key: "fields",
    direction: "desc",
  });
  const [selected, setSelected] = React.useState<string[]>(["mara"]);
  return (
    <DataTable<ShowcaseRow>
      caption="Objects in scope"
      columns={[
        { key: "object", header: "Object", sortable: true },
        { key: "owner", header: "Owner", sortable: true },
        {
          key: "fields",
          header: "Fields",
          numeric: true,
          align: "right",
          sortable: true,
          value: (row) => row.fields,
        },
      ]}
      rows={TABLE_ROWS}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.object}
      sort={sort}
      onSortChange={setSort}
      selectedIds={selected}
      onSelectionChange={setSelected}
      density="compact"
    />
  );
}

export function EditableFieldSpecimen(): React.ReactElement {
  const [value, setValue] = React.useState("Customer master");
  return (
    <EditableField
      label="Object name"
      value={value}
      onCommit={setValue}
      validate={(next) => (next.trim() === "" ? "A name is required." : null)}
    />
  );
}

const CHAT_SEED: ChatMessage[] = [
  { id: "1", role: "user", content: "Which objects are still unassessed?" },
  {
    id: "2",
    role: "assistant",
    content: "Two: **LFA1** and **T001**. Neither has an owner in the plan.",
  },
];

export function ChatPanelSpecimen(): React.ReactElement {
  const [messages, setMessages] = React.useState<ChatMessage[]>(CHAT_SEED);
  return (
    <ChatPanel
      messages={messages}
      height={220}
      markdown
      suggestions={["Summarise the risks"]}
      onSend={(text) =>
        setMessages((previous) => [
          ...previous,
          { id: `m${previous.length + 1}`, role: "user", content: text },
        ])
      }
    />
  );
}

export function AppShellSpecimen(): React.ReactElement {
  const [active, setActive] = React.useState("readiness");
  return (
    // A miniature of the real thing: the shell is a full-height layout, so it
    // is given a height here rather than being allowed to take the page.
    <AppShell filled style={{ height: 260, borderRadius: 8, overflow: "hidden" }}>
      <AppHeader brand="Migration control" actions={<Tag tone="accent">DEV</Tag>} />
      <AppBody>
        <AppSidebar width={148}>
          <AppSidebarNav
            items={[
              { key: "readiness", label: "Readiness" },
              { key: "design", label: "Design" },
              { key: "load", label: "Load", disabled: true },
            ]}
            activeKey={active}
            onSelect={setActive}
          />
        </AppSidebar>
        <AppContent header={<SectionHeader title="Readiness" size="sm" />}>
          <p style={{ margin: 0 }}>The page goes here.</p>
        </AppContent>
      </AppBody>
      <AppFooter actions={<Button size="sm">Export</Button>}>
        Last refreshed 09:14
      </AppFooter>
    </AppShell>
  );
}

/* ==========================================================================
   Tier one (0.3.0)
   --------------------------------------------------------------------------
   The stateful specimens for the inputs, overlays and structure components
   added in 0.3.0. Same reason as the ones above: a dialog that opens and a
   table that sorts are half the component, and a screenshot of the resting
   state shows the duller half.
   ========================================================================== */

export function TextInputSpecimen(): React.ReactElement {
  const [value, setValue] = React.useState("KNA1");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <TextInput
        label="Object name"
        hint="As it appears in SAP"
        value={value}
        onValueChange={setValue}
        icon="search"
        clearable
      />
      <TextInput label="Owner" error="Pick somebody who can sign off." value="" onValueChange={() => {}} />
    </div>
  );
}

export function NumberInputSpecimen(): React.ReactElement {
  const [value, setValue] = React.useState<number | null>(72);
  return (
    <NumberInput
      label="Threshold"
      hint="Per cent of fields mapped"
      value={value}
      onValueChange={setValue}
      min={0}
      max={100}
      unit="%"
      steppers
    />
  );
}

export function TextAreaSpecimen(): React.ReactElement {
  const [value, setValue] = React.useState("Two platoons detached to the crossing.");
  return (
    <TextArea label="Notes" counter maxLength={200} value={value} onValueChange={setValue} />
  );
}

export function ChoiceSpecimen(): React.ReactElement {
  const [checked, setChecked] = React.useState(true);
  const [scope, setScope] = React.useState("mine");
  const [terrain, setTerrain] = React.useState(true);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Checkbox
        label="Include archived objects"
        description="Adds 1,204 rows."
        checked={checked}
        onCheckedChange={setChecked}
      />
      <Checkbox label="Select all" indeterminate />
      <RadioGroup
        label="Scope"
        options={[
          { value: "all", label: "All objects" },
          { value: "mine", label: "Mine", description: "Owned by me" },
          { value: "none", label: "None", disabled: true },
        ]}
        value={scope}
        onValueChange={setScope}
      />
      <Toggle label="Terrain" description="Loads DEM chunks." checked={terrain} onCheckedChange={setTerrain} />
    </div>
  );
}

export function SelectSpecimen(): React.ReactElement {
  const [value, setValue] = React.useState<string | null>("kna1");
  return (
    <Select
      label="Table"
      options={[
        { value: "kna1", label: "KNA1", description: "Customer master", group: "Master data" },
        { value: "mara", label: "MARA", description: "Material master", group: "Master data" },
        { value: "vbak", label: "VBAK", description: "Sales header", group: "Transactions" },
      ]}
      value={value}
      onValueChange={setValue}
      searchable
      clearable
    />
  );
}

export function MultiSelectSpecimen(): React.ReactElement {
  const [values, setValues] = React.useState<string[]>(["finance"]);
  return (
    <MultiSelect
      label="Workstreams"
      options={[
        { value: "finance", label: "Finance" },
        { value: "supply", label: "Supply chain" },
        { value: "hr", label: "HR" },
        { value: "sales", label: "Sales" },
      ]}
      values={values}
      onValuesChange={setValues}
      bulk
      noun="workstreams"
    />
  );
}

export function SliderSpecimen(): React.ReactElement {
  const [opacity, setOpacity] = React.useState(65);
  const [range, setRange] = React.useState<[number, number]>([20, 80]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Slider
        label="Opacity"
        value={opacity}
        onValueChange={setOpacity}
        format={(value) => `${value}%`}
      />
      <RangeSlider
        label="Readiness band"
        value={range}
        onValueChange={setRange}
        minSpan={10}
        marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
        format={(value) => `${value}%`}
      />
    </div>
  );
}

/*
  NOTE FOR THE COPY-OVER — the package's `Button` does not accept a `ref`.
  Anchoring a popover to a button is the commonest case there is, and it
  currently needs a wrapper element like the one below. Worth fixing in the
  package: in React 19 a function component can simply declare `ref` in its
  props, so it is a one-line change to `ButtonProps` plus passing it through.
  Recorded in README.md under "Findings".
*/
export function PopoverSpecimen(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={anchor} style={{ display: "inline-flex" }}>
        <Button size="sm" onClick={() => setOpen((was) => !was)}>
          Filters
        </Button>
      </span>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        dismissRefs={[anchor]}
        aria-label="Filters"
      >
        <div style={{ display: "grid", gap: 8, minWidth: 200 }}>
          <Checkbox label="At risk only" />
          <Checkbox label="Unassigned" />
        </div>
      </Popover>
    </>
  );
}

export function MenuSpecimen(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={anchor} style={{ display: "inline-flex" }}>
        <Button size="sm" iconOnly onClick={() => setOpen((was) => !was)} aria-label="Actions">
          <Icon name="dotsHorizontal" />
        </Button>
      </span>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        triggerRef={anchor}
        aria-label="Object actions"
        items={[
          { type: "label", key: "l", label: "This object" },
          { key: "open", label: "Open detail", icon: "externalLink", shortcut: "↵" },
          { key: "copy", label: "Copy id", icon: "copy" },
          { type: "separator", key: "s" },
          { key: "remove", label: "Remove from scope", icon: "close", tone: "danger" },
        ]}
      />
    </>
  );
}

export function ContextMenuSpecimen(): React.ReactElement {
  const t = resolveTokens();
  return (
    <ContextMenu
      aria-label="Row actions"
      items={[
        { key: "assign", label: "Assign owner", icon: "user" },
        { key: "signoff", label: "Sign off", icon: "check" },
      ]}
    >
      {/*
        A real button rather than a div with a tabindex: the specimen needs
        something focusable to demonstrate Shift+F10 on, and "focusable thing"
        with no role is precisely what the a11y lint is right to object to.
      */}
      <button
        type="button"
        style={{
          width: "100%",
          padding: 16,
          border: `1px dashed ${t.color.border}`,
          borderRadius: t.radius.md,
          background: "transparent",
          color: t.color.textMuted,
          font: "inherit",
          fontSize: t.fontSize.sm,
          textAlign: "center",
          cursor: "context-menu",
        }}
      >
        Right-click here — or focus it and press Shift+F10
      </button>
    </ContextMenu>
  );
}

export function AccordionSpecimen(): React.ReactElement {
  return (
    <Accordion
      boxed
      defaultOpen={["general"]}
      sections={[
        { key: "general", title: "General", content: <p style={{ margin: 0 }}>Name, owner, scope.</p> },
        { key: "rules", title: "Rules", meta: "6", content: <p style={{ margin: 0 }}>Validation rules.</p> },
        { key: "history", title: "History", content: <p style={{ margin: 0 }}>Audit trail.</p> },
      ]}
    />
  );
}

export function SplitPaneSpecimen(): React.ReactElement {
  const t = resolveTokens();
  const pane = (text: string): React.ReactElement => (
    <div style={{ padding: 12, fontSize: t.fontSize.sm, color: t.color.textMuted }}>{text}</div>
  );
  return (
    <div style={{ height: 160, border: `1px solid ${t.color.borderSubtle}`, borderRadius: t.radius.md }}>
      <SplitPane>{[pane("List"), pane("Detail")]}</SplitPane>
    </div>
  );
}

export function PaginationSpecimen(): React.ReactElement {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={96}
        noun="objects"
        onPageChange={setPage}
        pageSizes={[10, 20, 50]}
        onPageSizeChange={setPageSize}
      />
      <LoadMore loaded={40} total={96} noun="objects" onLoadMore={() => {}} />
    </div>
  );
}

export function DateSpecimen(): React.ReactElement {
  const [date, setDate] = React.useState<string | null>("2026-03-01");
  const [range, setRange] = React.useState<[string | null, string | null]>([
    "2026-03-01",
    "2026-03-14",
  ]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <DateInput label="Cutover" value={date} onValueChange={setDate} />
      <DateRangeInput label="Freeze window" value={range} onValueChange={setRange} />
    </div>
  );
}

export function FilterSummarySpecimen(): React.ReactElement {
  const [filters, setFilters] = React.useState([
    { key: "ws", label: "Workstream", value: "Finance" },
    { key: "st", label: "Status", value: "At risk" },
  ]);
  return (
    <FilterSummary
      filters={filters.map((filter) => ({
        ...filter,
        onRemove: () => setFilters((was) => was.filter((candidate) => candidate.key !== filter.key)),
      }))}
      onClearAll={() => setFilters([])}
    />
  );
}

/* ==========================================================================
   Tier two (0.4.0)
   --------------------------------------------------------------------------
   The heavyweight ones. Their specimens carry more data than the others on
   purpose: a virtualised table with six rows proves nothing, and a pivot with
   one column is a list.
   ========================================================================== */

interface ScopeRow {
  id: string;
  object: string;
  workstream: string;
  week: string;
  fields: number;
  mapped: number;
}

/** 800 rows, generated: the point of virtualisation is that this is fine. */
const SCOPE_ROWS: ScopeRow[] = Array.from({ length: 800 }, (_, index) => {
  const workstreams = ["Finance", "Supply chain", "HR", "Sales"];
  const tables = ["KNA1", "MARA", "VBAK", "LFA1", "T001", "BKPF"];
  return {
    id: `row-${index}`,
    object: `${tables[index % tables.length]}-${String(index).padStart(3, "0")}`,
    workstream: workstreams[index % workstreams.length] ?? "Finance",
    week: `W${(index % 6) + 1}`,
    fields: 40 + ((index * 7) % 260),
    mapped: (index * 13) % 101,
  };
});

export function VirtualTableSpecimen(): React.ReactElement {
  const t = resolveTokens();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
        800 rows, ~20 in the DOM. Scroll it.
      </span>
      <DataTable<ScopeRow>
        virtual
        maxHeight={260}
        density="compact"
        caption="Objects in scope"
        columns={[
          { key: "object", header: "Object" },
          { key: "workstream", header: "Workstream" },
          { key: "fields", header: "Fields", align: "right", numeric: true, value: (row) => row.fields },
          { key: "mapped", header: "Mapped", align: "right", numeric: true, value: (row) => row.mapped },
        ]}
        rows={SCOPE_ROWS}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.object}
      />
    </div>
  );
}

export function PivotTableSpecimen(): React.ReactElement {
  return (
    <PivotTable<ScopeRow>
      rows={SCOPE_ROWS.slice(0, 200)}
      by={(row) => row.workstream}
      across={(row) => row.week}
      value={(row) => row.mapped}
      aggregate="avg"
      rowLabel="Workstream"
      caption="Average % mapped, by workstream and week"
      format={(value) => `${Math.round(value)}%`}
      heat
    />
  );
}

const SCOPE_TREE: TreeNode<{ label: string; objects: number; owner: string }>[] = [
  {
    id: "finance",
    data: { label: "Finance", objects: 18, owner: "Dana Okafor" },
    children: [
      { id: "kna1", data: { label: "KNA1 — Customer master", objects: 1, owner: "Dana Okafor" } },
      {
        id: "gl",
        data: { label: "General ledger", objects: 6, owner: "Jae Park" },
        children: [
          { id: "bkpf", data: { label: "BKPF — Document header", objects: 1, owner: "Jae Park" } },
          { id: "bseg", data: { label: "BSEG — Line items", objects: 1, owner: "Jae Park" } },
        ],
      },
    ],
  },
  {
    id: "supply",
    data: { label: "Supply chain", objects: 12, owner: "Sam Patel" },
    children: [{ id: "mara", data: { label: "MARA — Material master", objects: 1, owner: "Sam Patel" } }],
  },
];

export function TreeTableSpecimen(): React.ReactElement {
  const [expanded, setExpanded] = React.useState(new Set(["finance"]));
  const [active, setActive] = React.useState("finance");
  return (
    <TreeTable
      nodes={SCOPE_TREE}
      expanded={expanded}
      onExpandedChange={setExpanded}
      activeId={active}
      onActiveChange={setActive}
      caption="Scope by workstream — arrow keys navigate"
      density="compact"
      columns={[
        { key: "label", header: "Object", render: (data) => data.label },
        { key: "owner", header: "Owner", render: (data) => data.owner },
        { key: "objects", header: "Objects", align: "right", render: (data) => data.objects },
      ]}
    />
  );
}

export function KanbanSpecimen(): React.ReactElement {
  const [board, setBoard] = React.useState<Board>({
    backlog: ["kna1", "lfa1"],
    doing: ["mara"],
    review: ["vbak"],
    done: [],
  });
  const cards: Record<string, { title: string; owner: string; tone: DechoTone }> = {
    kna1: { title: "KNA1", owner: "Dana Okafor", tone: "neutral" },
    lfa1: { title: "LFA1", owner: "Unassigned", tone: "warning" },
    mara: { title: "MARA", owner: "Sam Patel", tone: "accent" },
    vbak: { title: "VBAK", owner: "Jae Park", tone: "info" },
  };
  return (
    <KanbanBoard
      board={board}
      onBoardChange={setBoard}
      cards={cards}
      columns={[
        { id: "backlog", title: "Backlog" },
        { id: "doing", title: "In progress", limit: 2 },
        { id: "review", title: "In review" },
        { id: "done", title: "Signed off" },
      ]}
      columnWidth={150}
      renderCard={(card) => (
        <span style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>{card.title}</span>
          <Tag tone={card.tone}>{card.owner}</Tag>
        </span>
      )}
    />
  );
}

export function CalendarSpecimen(): React.ReactElement {
  const [selected, setSelected] = React.useState<string | null>("2026-03-17");
  return (
    <Calendar
      defaultMonth="2026-03"
      today="2026-03-17"
      selected={selected}
      onSelect={setSelected}
      events={[
        { id: "1", date: "2026-03-09", label: "Dry run", tone: "info" },
        { id: "2", date: "2026-03-20", label: "Freeze", tone: "warning" },
        { id: "3", date: "2026-03-23", label: "Cutover", tone: "danger" },
        { id: "4", date: "2026-03-23", label: "Comms", tone: "accent" },
      ]}
    />
  );
}

export function FileDropSpecimen(): React.ReactElement {
  const [files, setFiles] = React.useState<{ id: string; src: string; caption: string; meta: string }[]>([]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <FileDrop
        rules={{ accept: [".csv", ".xlsx", "image/*"], maxBytes: 2 * 1024 * 1024, maxFiles: 4 }}
        onFiles={(accepted) =>
          setFiles((was) => [
            ...was,
            ...accepted.map((file) => ({
              id: `${file.name}-${file.size}`,
              src: URL.createObjectURL(file),
              caption: file.name,
              meta: describeFile(file.size),
            })),
          ])
        }
      />
      <ImageGallery
        items={files}
        thumbnail={72}
        empty="Nothing added yet"
        onRemove={(item) => setFiles((was) => was.filter((entry) => entry.id !== item.id))}
      />
    </div>
  );
}

export function MarkdownEditorSpecimen(): React.ReactElement {
  const [value, setValue] = React.useState(
    "**Two** objects are unassessed:\n\n- LFA1\n- T001\n\nNeither has an owner.",
  );
  return <MarkdownEditor label="Comment" value={value} onValueChange={setValue} rows={5} />;
}
