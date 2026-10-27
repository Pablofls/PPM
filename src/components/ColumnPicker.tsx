import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/AuthProvider'
import type { Column } from './DataTable'

/**
 * Qué columnas ve el profesor y en qué orden, por tabla.
 *
 * Vive en el navegador (`localStorage`) y no en la base: es una comodidad de
 * quien mira, no un dato del panel. La clave lleva el usuario para que dos
 * cuentas en la misma computadora no se pisen la vista.
 */
interface StoredColumns {
  order: string[]
  hidden: string[]
}

const EMPTY: StoredColumns = { order: [], hidden: [] }

function storageKey(userId: string, tableId: string) {
  return `ppm.columnas.${userId}.${tableId}`
}

function readStored(key: string): StoredColumns {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as StoredColumns | null
    if (parsed && Array.isArray(parsed.order) && Array.isArray(parsed.hidden)) return parsed
  } catch {
    // Almacenamiento bloqueado o JSON roto: la tabla queda como viene de fábrica.
  }
  return EMPTY
}

function writeStored(key: string, value: StoredColumns) {
  try {
    if (value.order.length === 0 && value.hidden.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento la preferencia dura lo que dure la pestaña.
  }
}

/**
 * Orden final de las claves: el guardado, con las columnas que no estaban
 * (un grupo de habilidades distinto, una semana nueva) en su lugar natural,
 * detrás de la que las precede en la definición. Las guardadas que ya no
 * existen se ignoran.
 */
function mergeOrder(defaultKeys: string[], savedOrder: string[]): string[] {
  const present = new Set(defaultKeys)
  const result = savedOrder.filter((key) => present.has(key))
  const placed = new Set(result)

  defaultKeys.forEach((key, index) => {
    if (placed.has(key)) return
    // La primera columna anterior que ya esté colocada; si no hay, al inicio.
    let insertAt = 0
    for (let previous = index - 1; previous >= 0; previous--) {
      const at = result.indexOf(defaultKeys[previous])
      if (at >= 0) {
        insertAt = at + 1
        break
      }
    }
    result.splice(insertAt, 0, key)
    placed.add(key)
  })

  return result
}

/**
 * Aplica la preferencia guardada a las columnas de una tabla.
 *
 * La columna fija (`sticky`, el nombre) no se mueve ni se oculta: es la que
 * identifica la fila al hacer scroll horizontal.
 */
export function useColumnPreferences<T>(
  tableId: string,
  columns: Column<T>[],
): { visibleColumns: Column<T>[]; picker: ReactNode } {
  const { profile } = useAuth()
  const key = storageKey(profile?.id ?? 'anonimo', tableId)
  const [stored, setStored] = useState<StoredColumns>(() => readStored(key))

  // Otra tabla u otro usuario en el mismo componente (p. ej. de 1.1 a 1.2).
  const [loadedKey, setLoadedKey] = useState(key)
  if (loadedKey !== key) {
    setLoadedKey(key)
    setStored(readStored(key))
  }

  const update = (next: StoredColumns) => {
    setStored(next)
    writeStored(key, next)
  }

  const locked = useMemo(
    () => new Set(columns.filter((column) => column.sticky).map((column) => column.key)),
    [columns],
  )
  const defaultKeys = useMemo(() => columns.map((column) => column.key), [columns])

  // Las fijas van primero, siempre en su orden de fábrica.
  const orderedKeys = useMemo(() => {
    const movable = mergeOrder(
      defaultKeys.filter((columnKey) => !locked.has(columnKey)),
      stored.order,
    )
    return [...defaultKeys.filter((columnKey) => locked.has(columnKey)), ...movable]
  }, [defaultKeys, locked, stored.order])

  const byKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])
  const hidden = useMemo(() => new Set(stored.hidden), [stored.hidden])

  const visibleColumns = useMemo(
    () =>
      orderedKeys
        .filter((columnKey) => locked.has(columnKey) || !hidden.has(columnKey))
        .map((columnKey) => byKey.get(columnKey)!),
    [orderedKeys, locked, hidden, byKey],
  )

  const items = orderedKeys.map((columnKey) => ({
    key: columnKey,
    header: byKey.get(columnKey)!.header,
    locked: locked.has(columnKey),
    visible: locked.has(columnKey) || !hidden.has(columnKey),
  }))

  const hiddenCount = items.filter((item) => !item.visible).length
  const isCustomized =
    hiddenCount > 0 || orderedKeys.some((columnKey, index) => columnKey !== defaultKeys[index])

  const picker = (
    <ColumnPicker
      items={items}
      hiddenCount={hiddenCount}
      isCustomized={isCustomized}
      onToggle={(columnKey) =>
        update({
          order: stored.order,
          hidden: hidden.has(columnKey)
            ? stored.hidden.filter((candidate) => candidate !== columnKey)
            : [...stored.hidden, columnKey],
        })
      }
      onReorder={(movableOrder) =>
        update({
          // Las guardadas que hoy no están (otro grupo de habilidades) se conservan.
          order: [...movableOrder, ...stored.order.filter((saved) => !byKey.has(saved))],
          hidden: stored.hidden,
        })
      }
      onShowAll={() => update({ order: stored.order, hidden: [] })}
      onReset={() => update(EMPTY)}
    />
  )

  return { visibleColumns, picker }
}

interface PickerItem {
  key: string
  header: string
  locked: boolean
  visible: boolean
}

function ColumnPicker({
  items,
  hiddenCount,
  isCustomized,
  onToggle,
  onReorder,
  onShowAll,
  onReset,
}: {
  items: PickerItem[]
  hiddenCount: number
  isCustomized: boolean
  onToggle: (key: string) => void
  /** Recibe el orden nuevo de las columnas movibles (sin las fijas). */
  onReorder: (order: string[]) => void
  onShowAll: () => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const movable = items.filter((item) => !item.locked).map((item) => item.key)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= movable.length || from === to) return
    const next = [...movable]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next)
  }

  const label = hiddenCount > 0 ? `Columnas · ${hiddenCount} ${hiddenCount === 1 ? 'oculta' : 'ocultas'}` : 'Columnas'

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none ${
          // Igual que un filtro puesto: avisa que la tabla no se ve como de fábrica.
          isCustomized
            ? 'border-ink-900 bg-ink-900 font-medium text-white'
            : 'border-ink-200 bg-white text-ink-500 hover:text-ink-900'
        }`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-none stroke-current" strokeWidth={1.5}>
          <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
          <path d="M6 2.5v11M10 2.5v11" />
        </svg>
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Elegir columnas"
          className="absolute left-0 z-30 mt-1.5 w-72 rounded-xl border border-ink-200 bg-white shadow-lg"
        >
          <p className="border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
            Marca las columnas a la vista. Arrastra o usa las flechas para cambiar el orden.
          </p>

          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((item) => {
              const index = movable.indexOf(item.key)
              return (
                <li
                  key={item.key}
                  draggable={!item.locked}
                  onDragStart={(event) => {
                    setDragging(item.key)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    if (!dragging || item.locked) return
                    event.preventDefault()
                    setDropTarget(item.key)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (dragging && !item.locked) move(movable.indexOf(dragging), index)
                    setDragging(null)
                    setDropTarget(null)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setDropTarget(null)
                  }}
                  className={`flex items-center gap-2 px-2 py-1 text-sm ${
                    dragging === item.key ? 'opacity-40' : ''
                  } ${dropTarget === item.key && dragging !== item.key ? 'bg-ink-100' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-4 text-center select-none ${
                      item.locked ? 'text-ink-200' : 'cursor-grab text-ink-400'
                    }`}
                  >
                    ⠿
                  </span>
                  <label
                    className={`flex min-w-0 flex-1 items-center gap-2 ${
                      item.locked ? 'text-ink-400' : 'cursor-pointer text-ink-700'
                    }`}
                    title={item.locked ? 'La columna fija siempre se muestra' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={item.visible}
                      disabled={item.locked}
                      onChange={() => onToggle(item.key)}
                    />
                    <span className="truncate">{item.header}</span>
                    {item.locked && (
                      <svg viewBox="0 0 16 16" aria-label="Fija" className="size-3.5 shrink-0 fill-current">
                        <path d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
                      </svg>
                    )}
                  </label>
                  {!item.locked && (
                    <span className="flex shrink-0">
                      <ArrowButton
                        label={`Subir columna ${item.header}`}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                      >
                        ↑
                      </ArrowButton>
                      <ArrowButton
                        label={`Bajar columna ${item.header}`}
                        disabled={index === movable.length - 1}
                        onClick={() => move(index, index + 1)}
                      >
                        ↓
                      </ArrowButton>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between border-t border-ink-100 px-2 py-2">
            <button
              type="button"
              onClick={onShowAll}
              disabled={hiddenCount === 0}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
            >
              Mostrar todas
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={!isCustomized}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
            >
              Restablecer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-200 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
