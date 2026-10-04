import type {
  DriverCommandIssuer,
  DriverCommandRequest,
  DriverModule,
  ModuleStyling,
} from "@drawdy/driver-protocol";
import { ACTION_BUTTON_SVG } from "./action-icon";
import { buildCards, CARD } from "./card";
import type { CardPayload, DriverToWebview, WebviewToDriver } from "./messages";
import { cleanName } from "./name";
import { WEBVIEW_HTML } from "./webview-html";

const SPOT_SEARCH_RINGS = 3;
const FLY_MS = 500;
const PROFILE_KEY = "profile";

let issue: DriverCommandIssuer;
let driverId = "";
let generateId: () => string = () => "";
let styling: ModuleStyling;
let requestSeq = 0;
let actionButtonId = "";
let webviewId = "";

type CommandType = DriverCommandRequest["type"];
type CommandOf<T extends CommandType> = Extract<
  DriverCommandRequest,
  { type: T }
>;
type WithoutIds<R> = R extends unknown
  ? Omit<R, "driverId" | "requestId">
  : never;

const send = <T extends CommandType>(
  request: { type: T } & WithoutIds<CommandOf<T>>,
) =>
  issue({
    ...request,
    driverId,
    requestId: String(requestSeq++),
  } as unknown as CommandOf<T>);

const stylingCss = (s: ModuleStyling) =>
  Object.entries(s)
    .map(([key, value]) =>
      key === "theme"
        ? `color-scheme: ${value};`
        : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`,
    )
    .join("");

function post(message: DriverToWebview): void {
  void send({
    type: "command:webview:post-message",
    req: { webviewDomId: webviewId, message },
  });
}

// Nearest empty spot to the viewport centre, searched outward in rings, so new
// cards never land on top of earlier ones.
async function freeSpot(
  width: number,
  height: number,
): Promise<{ x: number; y: number }> {
  const viewport = await send({ type: "command:camera:get-viewport-rect" });
  const rect = viewport.res.value?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  const centre = {
    x: Math.round(rect.x + rect.width / 2 - width / 2),
    y: Math.round(rect.y + rect.height / 2 - height / 2),
  };
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let gy = -SPOT_SEARCH_RINGS; gy <= SPOT_SEARCH_RINGS; gy++) {
    for (let gx = -SPOT_SEARCH_RINGS; gx <= SPOT_SEARCH_RINGS; gx++) {
      candidates.push({
        x: centre.x + gx * (width + CARD.gap),
        y: centre.y + gy * (height + CARD.gap),
        d: Math.hypot(gx * 1.4, gy),
      });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  for (const spot of candidates) {
    const hits = await send({
      type: "command:scene:query-rect",
      req: {
        rect: {
          x: spot.x - CARD.gap / 2,
          y: spot.y - CARD.gap / 2,
          width: width + CARD.gap,
          height: height + CARD.gap,
        },
        properties: ["type"],
      },
    });
    if ((hits.res.value?.drawdyElements.length ?? 0) === 0)
      return { x: spot.x, y: spot.y };
  }
  return centre;
}

type Profile = { name: string; background?: string; frame?: string };
let profile: Profile = { name: "" };

async function loadProfile(): Promise<Profile> {
  const stored = await send({
    type: "command:kv-storage:get",
    req: { key: PROFILE_KEY },
  });
  const got = stored.res.value?.got ?? {};
  profile = {
    name: typeof got.name === "string" ? cleanName(got.name) : "",
    ...(typeof got.background === "string" ? { background: got.background } : {}),
    ...(typeof got.frame === "string" ? { frame: got.frame } : {}),
  };
  return profile;
}

async function saveProfile(change: Partial<Profile>): Promise<void> {
  profile = { ...profile, ...change };
  await send({
    type: "command:kv-storage:set",
    req: { key: PROFILE_KEY, payload: profile },
  });
}

async function place(cards: CardPayload[]): Promise<void> {
  const width = cards.length * CARD.w + (cards.length - 1) * CARD.gap;
  const origin = await freeSpot(width, CARD.h);
  const { elements, animations } = buildCards(cards, origin, generateId);
  const added = await send({
    type: "command:scene:add-drawdy-elements",
    req: { elements },
  });
  if (added.res.error)
    throw new Error(added.res.error.message ?? added.res.error.type);
  if (animations.length) {
    // One update call starts every frame's clock together, so a lineup walks in step.
    await send({
      type: "command:scene:update-drawdy-elements",
      req: {
        updates: animations.map(({ id, animation }) => ({
          drawdyElementId: id,
          properties: { localAnimation: animation },
        })),
      },
    });
  }
  await send({
    type: "command:camera:fly-to-rect",
    req: {
      rect: { ...origin, width, height: CARD.h },
      flyDurationMs: FLY_MS,
      zoom: 1,
    },
  });
  post({ type: "placed", count: cards.length });
}

export const activate: DriverModule["activate"] = async (ctx) => {
  issue = ctx.issueCommand;
  driverId = ctx.manifest.driverId;
  generateId = ctx.generateId;
  styling = ctx.styling;
  actionButtonId = `${driverId}:action-button`;
  webviewId = `${driverId}:webview`;

  const button = await send({
    type: "command:dom:create-action-button",
    req: { domElementId: actionButtonId, svg: ACTION_BUTTON_SVG },
  });
  if (!button.res.value?.created) return;
  await send({
    type: "subscription:dom:element-clicked",
    req: { domElementId: actionButtonId },
  });
  await send({
    type: "subscription:webview:message",
    req: { webviewDomId: webviewId },
  });
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
  switch (event.type) {
    case "subscription:dom:element-clicked": {
      if (event.body.domElementId !== actionButtonId) return;
      await send({
        type: "command:webview:create",
        req: {
          webviewDomId: webviewId,
          htmlContent: WEBVIEW_HTML.replace(
            "/*__DRAWDY_STYLING__*/",
            stylingCss(styling),
          ),
          keepStateWhenClosed: true,
        },
      });
      return;
    }
    case "subscription:webview:message": {
      if (event.body.webviewDomId !== webviewId) return;
      const message = event.body.message as WebviewToDriver | null;
      if (message?.type === "ready") {
        post({ type: "profile", ...(await loadProfile()) });
      } else if (message?.type === "save-name") {
        await saveProfile({ name: cleanName(message.name) });
      } else if (message?.type === "save-style") {
        await saveProfile({
          ...(message.background ? { background: message.background } : {}),
          ...(message.frame ? { frame: message.frame } : {}),
        });
      } else if (message?.type === "place") {
        try {
          await place(message.cards);
        } catch (err) {
          post({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }
    default:
      return;
  }
};
