const WebSocketClient = require('uws');
const createPhoenix = require('phoenix');
const { protocol: {frontService, stateService}, parseMessage, arnaux } = require('message-factory');

const phoenix = createPhoenix(WebSocketClient, { uri: 'ws://messenger:3000', timeout: 500 });

const puzzles = require('../data/puzzles.json');
const users = require('../data/qd-masters.json');

const puzzleIds = [];
const participantIds = [];

const sessionAliasSuffixes = ['dq', 'kk', 'ms'];

function createSessions () {
    if (puzzleIds.length === puzzles.length && participantIds.length === users.length) {
        participantIds.forEach((participantId, index) => {
            const alias = `_qd-dev-${sessionAliasSuffixes[index]}`;
            phoenix.send(stateService.sessionCreate(participantId, alias, puzzleIds));
        });
    }
}

phoenix
    .on('connected', () => {
        console.log('[init-service]', 'phoenix is alive');
        phoenix.send(arnaux.checkin('init-service'));
        users.forEach(participant => {
            phoenix.send(frontService.createParticipant(participant));
        });
        puzzles.forEach(puzzle => {
            phoenix.send(stateService.puzzleCreate(puzzle));
        });
    })
    .on('disconnected', () => {
        console.error('[init-service]', 'phoenix disconnected');
    })
    .on('message', (incomingMessage) => {
        const { message } = parseMessage(incomingMessage.data);

        switch (message.name) {
            case 'puzzle.created':
                console.log('[init-service]', 'created puzzle', message.puzzleId);
                puzzleIds.push(message.puzzleId);
                createSessions();
                break;

            case 'participant.created':
                console.log('[init-service]', 'created participant', message.participantId);
                participantIds.push(message.participantId);
                createSessions();
                break;

            case 'session.created':
                console.log('[init-service]', 'created session', message.sessionId);
                break;

            default:
                console.warn('[init-service]', 'unhandled message', message.name);
        }
    });
