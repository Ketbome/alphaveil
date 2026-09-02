import { useState, type ReactNode } from 'react'
import {
  useFloating, autoUpdate, offset, flip, shift,
  useHover, useFocus, useDismiss, useRole, useInteractions,
  FloatingPortal, type Placement,
} from '@floating-ui/react'

interface Props {
  label: ReactNode
  placement?: Placement
  children: ReactNode
}

export function Tooltip({ label, placement = 'top', children }: Props) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { move: false, delay: { open: 300 } }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ])

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className="inline-flex shrink-0">
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 max-w-xs rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-fg shadow-xl"
          >
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
