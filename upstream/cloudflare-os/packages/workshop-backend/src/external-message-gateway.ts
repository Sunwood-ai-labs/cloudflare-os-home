import { WorkerEntrypoint } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import {
  type ExternalMessageGateway as ExternalMessageGatewayContract,
  type SubmitExternalMessageInput,
  type SubmitExternalMessageResult,
} from "@gadgets/workshop-shared/external-message-gateway";

type ExternalMessageGatewayProps = {
  source: string;
};

@validateRpc()
export class ExternalMessageGateway extends WorkerEntrypoint<Cloudflare.Env, ExternalMessageGatewayProps> implements ExternalMessageGatewayContract {
  async submitExternalMessage(input: SubmitExternalMessageInput): Promise<SubmitExternalMessageResult> {
    let source = this.ctx.props.source;
    if (!source) throw new Error("ExternalMessageGateway source prop is required.");

    let externalKeys = {
      gadget: `${source}:${input.gadgetKey}`,
      chat: `${source}:${input.chatKey}`,
      message: `${source}:${input.messageKey}`,
    };

    // External gateways decide which Gadget receives a prompt by passing gadgetKey.
    // We prefix that key with the binding-owned source before using it as the DO name,
    // preventing collisions with other gateways and web-created Gadget IDs.
    let overseer = this.ctx.exports.OverseerDurableObject.getByName(externalKeys.gadget);

    return await overseer.receiveExternalMessage({
      callerEmail: input.callerEmail,
      externalChatKey: externalKeys.chat,
      idempotencyKey: externalKeys.message,
      prompt: input.prompt,
      chatGatewayRpcTarget: input.chatGatewayRpcTarget,
      title: input.gadgetTitle,
    });
  }
}
