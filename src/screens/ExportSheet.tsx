import FileSheet from '../components/FileSheet'
import { buildExportFile } from '../export'

type Props = { open: boolean; onClose: () => void }

export default function ExportSheet({ open, onClose }: Props) {
  return <FileSheet open={open} onClose={onClose} title="Export JSON" copyLabel="Copy JSON" build={buildExportFile} />
}
