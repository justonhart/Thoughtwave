import { addColonizationOperation, addHostileRoom, unclaimRoom } from './empireManagement';

export default function manageFlags() {
    if (Game.flags.colonize) {
        addColonizationOperation(Game.flags.colonize.pos);
        Game.flags.colonize.remove();
    }

    if (Game.flags.unclaim) {
        unclaimRoom(Game.flags.unclaim.pos.roomName);
        Game.flags.unclaim.remove();
    }

    if (Game.flags.hostile) {
        addHostileRoom(Game.flags.hostile.pos.roomName);
        Game.flags.hostile.remove();
    }
}
