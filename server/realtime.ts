import type { GameRecord } from "./gameStore.ts";
import { toClientGameView } from "./gameStore.ts";

export type UserPresence = {
  uuid: string;
  name: string;
};

export type RealtimeGameView = ReturnType<typeof toClientGameView> & {
  users: UserPresence[];
};

export type RealtimeMessage =
  | { type: "snapshot"; game: RealtimeGameView }
  | { type: "error"; error: string }
  | { type: "action_error"; error: string };

export class RoomHub {
  private readonly rooms = new Map<string, Set<WebSocket>>();
  private readonly usersBySocket = new Map<WebSocket, UserPresence>();

  subscribe(
    gameId: string,
    socket: WebSocket,
    user: UserPresence = { uuid: crypto.randomUUID(), name: "Viewer" },
    onChange?: () => void,
  ): void {
    let room = this.rooms.get(gameId);
    if (!room) {
      room = new Set();
      this.rooms.set(gameId, room);
    }
    room.add(socket);
    this.usersBySocket.set(socket, user);

    const cleanup = () => {
      this.unsubscribe(gameId, socket);
      onChange?.();
    };
    socket.addEventListener("close", cleanup, { once: true });
    socket.addEventListener("error", cleanup, { once: true });
    onChange?.();
  }

  unsubscribe(gameId: string, socket: WebSocket): void {
    const room = this.rooms.get(gameId);
    if (!room) return;
    room.delete(socket);
    this.usersBySocket.delete(socket);
    if (room.size === 0) this.rooms.delete(gameId);
  }

  send(socket: WebSocket, message: RealtimeMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  updateUserName(uuid: string, name: string): string[] {
    const affectedGameIds = new Set<string>();
    for (const [gameId, room] of this.rooms) {
      for (const socket of room) {
        const user = this.usersBySocket.get(socket);
        if (user?.uuid !== uuid) continue;
        user.name = name;
        affectedGameIds.add(gameId);
      }
    }
    return [...affectedGameIds];
  }

  broadcastGame(record: GameRecord): void {
    const room = this.rooms.get(record.id);
    if (!room) return;
    for (const socket of room) {
      const user = this.usersBySocket.get(socket);
      const message: RealtimeMessage = {
        type: "snapshot",
        game: this.toRealtimeGameView(record, user?.uuid),
      };
      this.send(socket, message);
    }
  }

  toRealtimeGameView(record: GameRecord, viewerUuid?: string): RealtimeGameView {
    return { ...toClientGameView(record, viewerUuid), users: this.users(record.id) };
  }

  users(gameId: string): UserPresence[] {
    const room = this.rooms.get(gameId);
    if (!room) return [];
    const users = new Map<string, UserPresence>();
    for (const socket of room) {
      const user = this.usersBySocket.get(socket);
      if (user) users.set(user.uuid, user);
    }
    return [...users.values()];
  }

  connectionCount(gameId: string): number {
    return this.rooms.get(gameId)?.size ?? 0;
  }
}

export const roomHub = new RoomHub();
