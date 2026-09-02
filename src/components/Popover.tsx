import { useState, type ReactNode } from 'react'
import {
  useFloating, autoUpdate, offset, flip, shift,
  useClick, useDismiss, useRole, useInteractions,
  FloatingPortal, FloatingFocusManager, type Placement,
} from '@floating-ui/react'

interface Props {
  trigger: (props: { open: boolean }) => ReactNode
  placement?: Placement
  children: ReactNode | ((close: () => void) => ReactNode)
  className?: string
}

export function Popover({ trigger, placement = 'bottom-end', children, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ])

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className="inline-flex">
        {trigger({ open })}
      </span>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className={`z-40 rounded-xl border border-line bg-panel p-3 shadow-2xl outline-none ${className}`}
            >
              {typeof children === 'function' ? children(() => setOpen(false)) : children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
