import { createFileRoute } from '@tanstack/react-router'
import AdminPage from '../AdminPage'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})
