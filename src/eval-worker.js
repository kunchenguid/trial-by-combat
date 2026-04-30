import { parentPort } from 'node:worker_threads';
import { greedyBot, mctsBot } from './bots.js';
import { simulate } from './sim.js';

parentPort.on('message', (task) => {
  const blueAgent = makeAgent(task.blueSpec, task.blueIters, task.rolloutDepth);
  const redAgent = makeAgent(task.redSpec, task.redIters, task.rolloutDepth);
  const result = simulate(task.map, blueAgent, redAgent, {
    seed: task.seed,
    turnCap: task.turnCap,
    matchId: task.matchId ?? 'eval',
  });
  parentPort.postMessage({
    taskId: task.taskId,
    winner: result.winner,
    turns: result.turns,
    replayRequired: result.replayRequired,
    itemTypesUsed: result.itemTypesUsed,
    leverTypesUsed: result.leverTypesUsed,
    buffsPickedUpByType: result.buffsPickedUpByType,
  });
});

function makeAgent(spec, iters, rolloutDepth) {
  if (spec === 'greedy') return greedyBot;
  if (spec === 'mcts-low' || spec === 'mcts-mid' || spec === 'mcts-high') {
    return (game, side, rng) => mctsBot(game, side, rng, { iters, rolloutDepth });
  }
  throw new Error(`unknown agent spec: ${spec}`);
}
