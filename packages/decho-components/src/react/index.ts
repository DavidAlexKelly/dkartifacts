/**
 * The components. Re-exported by `../index.ts`, which is the entry point
 * consumers use; this file exists so the components can be imported as a group
 * from inside the package without going through it.
 *
 * Alphabetical, including the pure modules at the foot — those are exported
 * because consumers legitimately need the arithmetic without the component: a
 * server-paged table wants `pageInfo` without `Pagination`, and an Ontology
 * date property wants `isIsoDate` without `DateInput`.
 */

export { Accordion, type AccordionProps, type AccordionSection } from "./Accordion.js";
export {
  CopyButton,
  DownloadButton,
  FilterSummary,
  RefreshButton,
  type ActiveFilter,
  type CopyButtonProps,
  type DownloadButtonProps,
  type FilterSummaryProps,
  type RefreshButtonProps,
} from "./ActionButtons.js";
export { AppBreadcrumb, type AppBreadcrumbProps, type Crumb } from "./AppBreadcrumb.js";
export { AppBody, AppContent, type AppContentProps } from "./AppContent.js";
export { AppFooter, type AppFooterProps } from "./AppFooter.js";
export { AppHeader, type AppHeaderProps } from "./AppHeader.js";
export { AppShell, type AppShellProps } from "./AppShell.js";
export { AppSidebar, type AppSidebarProps } from "./AppSidebar.js";
export {
  AppSidebarNav,
  type AppSidebarNavItem,
  type AppSidebarNavProps,
} from "./AppSidebarNav.js";
export { Avatar, AvatarGroup, type AvatarGroupProps, type AvatarProps } from "./Avatar.js";
export { Banner, type BannerProps } from "./Banner.js";
export { Button, type ButtonProps } from "./Button.js";
export { Calendar, type CalendarEvent, type CalendarProps } from "./Calendar.js";
export { Callout, type CalloutProps } from "./Callout.js";
export { ChatPanel, type ChatMessage, type ChatPanelProps, type ChatRole } from "./ChatPanel.js";
export { Checkbox, type CheckboxProps } from "./Checkbox.js";
export { CodeBlock, type CodeBlockProps } from "./CodeBlock.js";
export { Card, type CardProps } from "./Card.js";
export { ComponentShowcase, type ComponentShowcaseProps } from "./ComponentShowcase.js";
export { ContextMenu, type ContextMenuProps } from "./ContextMenu.js";
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableSort,
  type SortDirection,
} from "./DataTable.js";
export {
  DateInput,
  DateRangeInput,
  type DateInputProps,
  type DateRangeInputProps,
} from "./DateInput.js";
export {
  BarChart,
  ChartLegend,
  DonutChart,
  Sparkline,
  StatusHeatmap,
  type BarChartProps,
  type BarDatum,
  type ChartLegendProps,
  type DonutChartProps,
  type HeatmapRow,
  type SparklineProps,
  type StatusHeatmapProps,
} from "./charts.js";
export { DechoSurface, type DechoSurfaceProps } from "./DechoSurface.js";
export { DemoDataBadge, type DemoDataBadgeProps } from "./DemoDataBadge.js";
export { Dialog, type DialogProps } from "./Dialog.js";
export { Drawer, type DrawerProps } from "./Drawer.js";
export { EditableField, type EditableFieldProps } from "./EditableField.js";
export { EmptyState, type EmptyStateProps } from "./EmptyState.js";
export { ErrorBoundary, type ErrorBoundaryProps } from "./ErrorBoundary.js";
export { FacetGroup, type Facet, type FacetGroupProps } from "./FacetGroup.js";
export {
  FileDrop,
  ImageGallery,
  type FileDropProps,
  type GalleryItem,
  type ImageGalleryProps,
} from "./FileDrop.js";
export { GanttChart, type GanttChartProps, type GanttTask } from "./GanttChart.js";
export { Field, type FieldProps } from "./Field.js";
export { Icon, ICON_NAMES, type DechoIconName, type IconProps } from "./Icon.js";
export { KanbanBoard, type KanbanBoardProps, type KanbanColumn } from "./KanbanBoard.js";
export { KpiTile, type KpiTileProps } from "./KpiTile.js";
export { Legend, type LegendItem, type LegendProps } from "./Legend.js";
export {
  Menu,
  type MenuAction,
  type MenuEntry,
  type MenuLabel,
  type MenuProps,
  type MenuSeparator,
} from "./Menu.js";
export { MarkdownEditor, type MarkdownEditorProps } from "./MarkdownEditor.js";
export {
  MARKDOWN_ACTIONS,
  applyMarkdownAction,
  type MarkdownAction,
} from "./markdownActions.js";
export { MetricTile, type MetricTileProps } from "./MetricTile.js";
export { MultiSelect, type MultiSelectProps } from "./MultiSelect.js";
export { NavItem, type NavItemProps } from "./NavItem.js";
export { NumberInput, type NumberInputProps } from "./NumberInput.js";
export { LoadMore, Pagination, type LoadMoreProps, type PaginationProps } from "./Pagination.js";
export { Panel, type PanelProps } from "./Panel.js";
export { PivotTable, type PivotTableProps } from "./PivotTable.js";
export { Popover, type PopoverProps } from "./Popover.js";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar.js";
export { RadioGroup, type RadioGroupProps, type RadioOption } from "./RadioGroup.js";
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader.js";
export { Select, type SelectProps } from "./Select.js";
export {
  ADVANCED_GROUPS,
  EVERYDAY_GROUPS,
  SHOWCASE_GROUPS,
  SHOWCASE_SPECIMENS,
  type ShowcaseGroup,
  type ShowcaseSpecimen,
} from "./showcaseSpecimens.js";
export { SimpleMarkdown, type SimpleMarkdownProps } from "./SimpleMarkdown.js";
export { Skeleton, type SkeletonProps } from "./Skeleton.js";
export { RangeSlider, Slider, type RangeSliderProps, type SliderProps } from "./Slider.js";
export { SplitPane, type SplitPaneProps } from "./SplitPane.js";
export { StackedBar, type StackedBarProps, type StackedBarSegment } from "./StackedBar.js";
export { StatusChip, type StatusChipProps } from "./StatusChip.js";
export { StatusDot, type StatusDotProps } from "./StatusDot.js";
export { Stepper, type Step, type StepState, type StepperProps } from "./Stepper.js";
export { Tabs, type TabItem, type TabsProps } from "./Tabs.js";
export { Tag, type TagProps } from "./Tag.js";
export { TextArea, type TextAreaProps } from "./TextArea.js";
export { TextInput, type TextInputProps } from "./TextInput.js";
export { Timeline, type TimelineEvent, type TimelineProps } from "./Timeline.js";
export { ToastCard, ToastHost, type ToastCardProps, type ToastHostProps, type ToastModel } from "./Toast.js";
export { useToast, type ToastApi, type ToastInput } from "./toastContext.js";
export { Toggle, type ToggleProps } from "./Toggle.js";
export {
  TreeTable,
  type TreeColumn,
  type TreeTableProps,
} from "./TreeTable.js";
export {
  Toolbar,
  ToolbarSpacer,
  ToolbarStatus,
  type ToolbarProps,
} from "./Toolbar.js";
export { Tooltip, type TooltipProps } from "./Tooltip.js";
export { UserName, type UserNameProps } from "./UserName.js";
export { useDismiss, type DismissOptions } from "./useDismiss.js";
export {
  useOutsideDismiss,
  isWithin,
  type Container,
  type OutsideDismissOptions,
} from "./useOutsideDismiss.js";

/* ==========================================================================
   The pure modules
   --------------------------------------------------------------------------
   Arithmetic and state machines, free of React, each tested exhaustively.
   Exported because a consumer often needs the logic without the component.
   ========================================================================== */

export {
  addDays,
  clampDate,
  compareDates,
  daysBetween,
  daysInMonth,
  formatDate,
  isBefore,
  isIsoDate,
  normaliseRange,
  relativeTime,
  today,
  type DateRange,
  type IsoDate,
} from "./dateValue.js";
export { SR_ONLY, describedBy, useFieldAria, type FieldAria } from "./fieldAria.js";
export { initialsOf } from "./initials.js";
export {
  extendTypeahead,
  isTypeaheadKey,
  nextIndex,
  typeaheadIndex,
  type NavKey,
  type NavigableItem,
  type TypeaheadState,
} from "./listNavigation.js";
export {
  clamp,
  outOfBounds,
  parseNumber,
  precisionOf,
  roundToStep,
  stepValue,
  type Bounds,
  type NumberValue,
} from "./numberInput.js";
export {
  columnOf,
  moveCard,
  moveColumn,
  reorderColumn,
  type Board,
} from "./kanban.js";
export { ganttScale, ticksFor, type GanttBar, type GanttScale, type GanttTick } from "./ganttScale.js";
export {
  acceptAttribute,
  describeFile,
  validateFiles,
  type FileRules,
  type RejectedFile,
  type ValidationResult,
} from "./fileValidation.js";
export {
  monthGrid,
  monthOf,
  shiftMonth,
  weekdayLabels,
  type GridDay,
  type IsoMonth,
  type MonthGrid,
} from "./monthGrid.js";
export { pageInfo, pageSummary, pageWindow, type PageInfo, type PageToken } from "./pageMath.js";
export { pivot, type Aggregation, type PivotSpec, type PivotTable as PivotModel } from "./pivot.js";
export { placeFloating, type Align, type Placement, type Rect, type Side } from "./placement.js";
export {
  filterOptions,
  fold,
  groupOptions,
  summariseSelection,
  type OptionGroup,
  type SelectOption,
} from "./selectOptions.js";
export {
  decimals,
  fraction,
  keyStep,
  moveRangeEnd,
  nearestEnd,
  snap,
  valueAt,
  type Scale,
} from "./sliderMath.js";
export {
  MAX_TOASTS,
  defaultDuration,
  toastReducer,
  type Toast,
  type ToastEvent,
  type ToastState,
} from "./toastQueue.js";
export {
  countNodes,
  expandTo,
  expandableIds,
  filterTree,
  flattenTree,
  toggleNode,
  treeKey,
  type FlatRow,
  type TreeKeyResult,
  type TreeNode,
} from "./tree.js";
export { scrollToRow, virtualRange, type VirtualRange } from "./virtualRange.js";
