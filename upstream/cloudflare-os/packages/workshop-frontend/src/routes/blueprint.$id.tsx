import { createFileRoute } from '@tanstack/react-router'
import { useRpcStub } from '../RpcContext'
import BlueprintLandingPage from '../BlueprintLandingPage'

export const Route = createFileRoute('/blueprint/$id')({
  component: BlueprintRoute,
})

function BlueprintRoute() {
  const rpcStub = useRpcStub()
  return <BlueprintLandingPage rpcStub={rpcStub} />
}
