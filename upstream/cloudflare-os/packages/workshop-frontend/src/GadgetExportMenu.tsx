import { useState } from 'react'
import { Tooltip, useKumoToastManager } from '@cloudflare/kumo'
import { DownloadSimple } from '@phosphor-icons/react'
import type { RpcStub } from 'capnweb'
import type { GadgetClient } from '@gadgets/workshop-shared/api'
import { WorkshopIconButton } from './components/WorkshopControls'
import { makeExportFilename, saveStreamToFile } from './fileTransfers'

type Props = {
  gadget: RpcStub<GadgetClient> | null
  gadgetTitle: string
  chatId?: number
  disabled?: boolean
}

export default function GadgetExportMenu({ gadget, gadgetTitle, chatId, disabled }: Props) {
  const [exporting, setExporting] = useState(false)
  const toasts = useKumoToastManager()

  const download = async () => {
    if (!gadget || exporting) return

    setExporting(true)
    try {
      await saveStreamToFile(
        () => gadget.exportPdf(chatId),
        makeExportFilename(gadgetTitle, '.pdf'),
        {
          description: 'PDF document',
          contentType: 'application/pdf',
          extension: '.pdf',
        },
      )
    } catch (error) {
      console.error('Failed to export Gadget as PDF:', error)
      toasts.add({ title: 'Failed to export PDF', variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Tooltip content={exporting ? 'Exporting to PDF' : 'Export to PDF'} asChild>
      <span className="relative inline-flex">
        <WorkshopIconButton
          aria-label="Export to PDF"
          disabled={disabled || !gadget || exporting}
          onClick={() => { void download() }}
        >
          <DownloadSimple size={17} />
        </WorkshopIconButton>
        {exporting && (
          <span className="pointer-events-none absolute bottom-0 left-1 right-1 h-0.5 overflow-hidden rounded-full bg-kumo-fill">
            <span className="absolute inset-y-0 w-1/3 bg-kumo-brand animate-[thinking_1.5s_ease-in-out_infinite]" />
          </span>
        )}
      </span>
    </Tooltip>
  )
}
