import * as React from "react";
import { MoreHorizontal, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Align = "left" | "right" | "center";

/** One column of a {@link DataTable}. `cell` receives the row + its index. */
export type Column<T> = {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: Align;
  /** Tailwind width class, e.g. `"w-[110px]"`. */
  width?: string;
  headClassName?: string;
  cellClassName?: string;
  /** Whether clicking this cell fires `onRowClick`. Default `true`. */
  clickable?: boolean;
  /** Custom skeleton node for the loading state (defaults to a bar). */
  skeleton?: React.ReactNode;
  /** Return a comparable value to make this column sortable (client-side). */
  sortAccessor?: (row: T) => string | number | null | undefined;
};

/** A single row action — rendered in both the right-click menu and the ⋯ menu. */
export type RowAction<T> = {
  key: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: (row: T) => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Draw a separator above this item. */
  separatorBefore?: boolean;
};

export type DataTableSelection<T> = {
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  /** Whether a given row may be selected. Default: all rows. */
  isSelectable?: (row: T) => boolean;
  selectAllLabel?: string;
  selectRowLabel?: string;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  /** Per-row actions → right-click context menu + trailing ⋯ button. */
  rowActions?: (row: T) => RowAction<T>[];
  actionsLabel?: string;
  /** Keep the right-click context menu but drop the trailing ⋯ button column. */
  hideActionsColumn?: boolean;
  selection?: DataTableSelection<T>;
  /** Shown in place of the body when there are no rows and not loading. */
  empty?: React.ReactNode;
  striped?: boolean;
  stickyHeader?: boolean;
  /** Dim the table while refetching (keeps the current rows visible). */
  isFetching?: boolean;
  animateRows?: boolean;
  className?: string;
  /** Controlled sort: pass both to let the parent sort (e.g. server-side /
   *  across pages). When `onSortChange` is set the table stops sorting `rows`
   *  itself and just reflects `sortState` in the header. */
  sortState?: SortState;
  onSortChange?: (next: SortState) => void;
};

export type SortState = { id: string; dir: "asc" | "desc" } | null;

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/** Render a shared action list into whichever menu primitive is passed in. */
function ActionItems<T>({
  actions, row, Item, Separator,
}: {
  actions: RowAction<T>[];
  row: T;
  Item: React.ElementType;
  Separator: React.ElementType;
}) {
  return (
    <>
      {actions.map((a, i) => (
        <React.Fragment key={a.key}>
          {a.separatorBefore && i > 0 && <Separator />}
          <Item
            disabled={a.disabled}
            onSelect={() => a.onSelect(row)}
            className={a.destructive ? "text-destructive focus:bg-destructive focus:text-white focus:[&_svg]:text-white" : undefined}
          >
            {a.icon && <a.icon className="size-4" />}
            {a.label}
          </Item>
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * Generic, reusable list/table. Give it `columns` + `rows`; opt into
 * `selection`, `rowActions` (right-click **and** ⋯ menu), striping, sticky
 * header, skeleton loading and an empty state. Built on the shadcn Table +
 * ContextMenu/DropdownMenu primitives so every list in the app looks and
 * behaves the same. See `modules/documents/page.tsx` for the reference use.
 */
export function DataTable<T>({
  columns, rows, rowKey,
  loading = false, skeletonRows = 8,
  onRowClick, rowActions, actionsLabel = "Actions",
  selection, empty, striped = true, stickyHeader = false,
  isFetching = false, animateRows = true, className,
  sortState, onSortChange, hideActionsColumn = false,
}: DataTableProps<T>) {
  const hasSelection = !!selection;
  const hasActions = !!rowActions;
  const showKebab = hasActions && !hideActionsColumn; // trailing ⋯ column
  const totalCols = columns.length + (hasSelection ? 1 : 0) + (showKebab ? 1 : 0);

  // Sorting: controlled (parent sorts `rows`, e.g. across pages) when
  // `onSortChange` is given; otherwise uncontrolled client-side sort of `rows`.
  const controlledSort = onSortChange !== undefined;
  const [internalSort, setInternalSort] = React.useState<SortState>(null);
  const sort = controlledSort ? (sortState ?? null) : internalSort;
  const toggleSort = (id: string) => {
    const next: SortState =
      sort?.id !== id ? { id, dir: "asc" } : sort.dir === "asc" ? { id, dir: "desc" } : null;
    if (controlledSort) onSortChange!(next);
    else setInternalSort(next);
  };
  const sortedRows = React.useMemo(() => {
    if (controlledSort) return rows; // parent already sorted the rows
    const col = sort && columns.find((c) => c.id === sort.id);
    if (!sort || !col?.sortAccessor) return rows;
    const acc = col.sortAccessor;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls sort last
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns, controlledSort]);

  // select-all state (derived from the selectable rows currently on screen)
  const selectableKeys = hasSelection
    ? rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => selection!.isSelectable?.(r) ?? true)
        .map(({ r, i }) => rowKey(r, i))
    : [];
  const allSelected =
    selectableKeys.length > 0 && selectableKeys.every((k) => selection!.selectedIds.has(k));
  const someSelected =
    !allSelected && selectableKeys.some((k) => selection!.selectedIds.has(k));

  const headCell = (col: Column<T>) => {
    const activeSort = sort?.id === col.id ? sort : null;
    return (
      <TableHead
        key={col.id}
        className={cn(col.align && alignClass[col.align], col.width, col.headClassName)}
      >
        {col.sortAccessor ? (
          <button
            type="button"
            onClick={() => toggleSort(col.id)}
            className={cn(
              "-my-1 inline-flex items-center gap-1 py-1 transition-colors hover:text-foreground",
              col.align === "right" && "flex-row-reverse",
              activeSort && "text-foreground",
            )}
          >
            {col.header}
            {activeSort
              ? activeSort.dir === "asc"
                ? <ChevronUp className="size-3.5 shrink-0" />
                : <ChevronDown className="size-3.5 shrink-0" />
              : <ChevronsUpDown className="size-3.5 shrink-0 opacity-40" />}
          </button>
        ) : (
          col.header
        )}
      </TableHead>
    );
  };

  const dataCells = (row: T, index: number) =>
    columns.map((col) => {
      const clickable = onRowClick && col.clickable !== false;
      return (
        <TableCell
          key={col.id}
          className={cn(col.align && alignClass[col.align], col.width, col.cellClassName)}
          onClick={clickable ? () => onRowClick!(row) : undefined}
        >
          {col.cell(row, index)}
        </TableCell>
      );
    });

  const renderRow = (row: T, index: number) => {
    const key = rowKey(row, index);
    const selected = hasSelection && selection!.selectedIds.has(key);
    const actions = hasActions ? rowActions!(row) : [];
    const rowSelectable = hasSelection ? (selection!.isSelectable?.(row) ?? true) : false;

    const rowEl = (
      <TableRow
        className={cn(
          onRowClick && "cursor-pointer",
          selected && "bg-primary/10",
          animateRows &&
            "animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300",
        )}
        style={animateRows ? { animationDelay: `${Math.min(index, 12) * 25}ms` } : undefined}
        data-state={selected ? "selected" : undefined}
      >
        {hasSelection && (
          <TableCell className="w-[40px]" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              disabled={!rowSelectable}
              onCheckedChange={() => selection!.onToggleRow(key)}
              aria-label={selection!.selectRowLabel ?? "Select row"}
              className="size-4 align-middle disabled:opacity-30"
            />
          </TableCell>
        )}
        {dataCells(row, index)}
        {showKebab && (
          <TableCell className="w-[44px] pl-0 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
            {actions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
                  aria-label={actionsLabel}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <ActionItems
                    actions={actions}
                    row={row}
                    Item={DropdownMenuItem}
                    Separator={DropdownMenuSeparator}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </TableCell>
        )}
      </TableRow>
    );

    // Wrap in a right-click context menu when the row exposes actions.
    if (hasActions && actions.length > 0) {
      return (
        <ContextMenu key={key}>
          <ContextMenuTrigger asChild>{rowEl}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ActionItems
              actions={actions}
              row={row}
              Item={ContextMenuItem}
              Separator={ContextMenuSeparator}
            />
          </ContextMenuContent>
        </ContextMenu>
      );
    }
    return <React.Fragment key={key}>{rowEl}</React.Fragment>;
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-x-auto",
        !loading && isFetching && "opacity-70 transition-opacity",
        className,
      )}
    >
      <Table>
        <TableHeader className={stickyHeader ? "sticky top-0 z-10 bg-card" : undefined}>
          <TableRow className="hover:bg-transparent">
            {hasSelection && (
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  disabled={selectableKeys.length === 0}
                  onCheckedChange={() => selection!.onToggleAll()}
                  aria-label={selection!.selectAllLabel ?? "Select all"}
                  className="size-4 align-middle"
                />
              </TableHead>
            )}
            {columns.map(headCell)}
            {showKebab && <TableHead className="w-[44px]" />}
          </TableRow>
        </TableHeader>
        <TableBody className={cn(!loading && striped && "[&>tr:nth-child(even)]:bg-muted/40")}>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                {hasSelection && (
                  <TableCell className="w-[40px]"><Skeleton className="size-4 rounded" /></TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.id} className={cn(col.align && alignClass[col.align], col.width)}>
                    {col.skeleton ?? (
                      <Skeleton className={cn("h-3.5 w-24", col.align === "right" && "ml-auto")} />
                    )}
                  </TableCell>
                ))}
                {showKebab && <TableCell className="w-[44px]" />}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={totalCols} className="py-16">
                {empty ?? (
                  <div className="text-center text-sm text-muted-foreground">—</div>
                )}
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map(renderRow)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
