import { Button, Input, InputArea } from '@cloudflare/kumo'
import type { ComponentProps, ReactNode } from 'react'

const buttonBaseClassName =
  'inline-flex cursor-pointer items-center justify-center rounded-lg text-[13px] leading-[18px] font-medium tracking-[-0.25px] transition-[background-color,color,opacity,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100'

const buttonToneClassNames = {
  primary:
    '!h-9 bg-kumo-contrast px-3 text-kumo-inverse enabled:hover:bg-kumo-strong disabled:opacity-50',
  secondary:
    '!h-8 border border-kumo-line bg-kumo-base px-3 text-kumo-default enabled:hover:bg-kumo-elevated disabled:opacity-40',
  danger:
    '!h-8 bg-kumo-danger px-3 text-white enabled:hover:opacity-90 disabled:opacity-50',
} as const

type WorkshopButtonTone = keyof typeof buttonToneClassNames

type WorkshopButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'shape'> & {
  tone?: WorkshopButtonTone
}

export function WorkshopButton({
  tone = 'secondary',
  className = '',
  ...props
}: WorkshopButtonProps) {
  const variant = tone === 'primary'
    ? 'primary'
    : tone === 'danger'
      ? 'destructive'
      : 'secondary'

  return (
    <Button
      {...props}
      variant={variant}
      className={`${buttonBaseClassName} ${buttonToneClassNames[tone]} ${className}`}
    />
  )
}

type WorkshopIconButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'children' | 'shape'> & {
  children: ReactNode
  danger?: boolean
  tone?: 'ghost' | 'primary'
  'aria-label': string
}

export function WorkshopIconButton({
  children,
  danger = false,
  tone = 'ghost',
  className = '',
  ...props
}: WorkshopIconButtonProps) {
  const toneClassName = tone === 'primary'
    ? 'bg-kumo-contrast text-kumo-inverse enabled:hover:bg-kumo-strong enabled:hover:text-kumo-inverse'
    : danger
      ? 'text-kumo-subtle enabled:hover:bg-kumo-danger-tint enabled:hover:text-kumo-danger'
      : 'text-kumo-subtle enabled:hover:bg-kumo-tint enabled:hover:text-kumo-default'
  const variant = tone === 'primary' ? 'primary' : 'ghost'

  return (
    <Button
      {...props}
      variant={variant}
      shape="square"
      className={`!flex !h-8 !w-8 shrink-0 cursor-pointer items-center justify-center rounded-md !p-0 transition-[background-color,color,opacity,transform] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${toneClassName} ${className}`}
    >
      {children}
    </Button>
  )
}

type WorkshopInputProps = ComponentProps<typeof Input>

export function WorkshopInput({ className = '', ...props }: WorkshopInputProps) {
  return (
    <Input
      {...props}
      className={`!h-9 rounded-lg border border-kumo-line bg-kumo-base px-3 text-[13px] leading-[18px] font-normal tracking-[-0.25px] text-kumo-default placeholder:text-kumo-inactive shadow-none focus:border-kumo-ring focus:outline-none focus:ring-1 focus:ring-kumo-ring/15 ${className}`}
    />
  )
}

type WorkshopInputAreaProps = ComponentProps<typeof InputArea>

export function WorkshopInputArea({ className = '', ...props }: WorkshopInputAreaProps) {
  return (
    <InputArea
      {...props}
      className={`rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-[13px] leading-[18px] font-normal tracking-[-0.25px] text-kumo-default placeholder:text-kumo-inactive shadow-none focus:border-kumo-ring focus:outline-none focus:ring-1 focus:ring-kumo-ring/15 ${className}`}
    />
  )
}
