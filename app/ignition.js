const WebSocketClient = require('uws');
const createPhoenix = require('phoenix');
const { protocol: {frontService, stateService}, parseMessage, arnaux } = require('message-factory');

const phoenix = createPhoenix(WebSocketClient, { uri: 'ws://messenger:3000', timeout: 500 });

const _qdPuzzles = require('../data/_qd-puzzles.json');
const cssqdPuzzles = require('../data/cssqd-puzzles.json');
const users = require('../data/masters.json');

const _qdPuzzleIds = [];
const cssqdPuzzleIds = [];
const participantIds = [];

const sessionAliasSuffixes = ['dq', 'kk', 'ms', 'av', 'ay']; // order here MUST be the same as in ../data/masters.json

function createSessions() {
    participantIds.forEach((participantId, index) => {
        const _qdAlias = `_qd-dev-${sessionAliasSuffixes[index]}`;
        const cssqdAlias = `cssqd-dev-${sessionAliasSuffixes[index]}`;
        phoenix.send(stateService.sessionCreate('_qd', participantId, _qdAlias, _qdPuzzleIds));
        phoenix.send(stateService.sessionCreate('cssqd', participantId, cssqdAlias, cssqdPuzzleIds));
    });

    phoenix.send(stateService.sessionCreate('_qd', participantIds[0], 'rs.krakow', _qdPuzzleIds.slice(1)));
    phoenix.send(stateService.sessionCreate('_qd', participantIds[0], 'rs.krakow-demo', [_qdPuzzleIds[0]]));
    phoenix.send(stateService.sessionCreate('_qd', participantIds[0], 'lvivjs', _qdPuzzleIds.slice(1)));
    phoenix.send(stateService.sessionCreate('_qd', participantIds[0], 'lvivjs-demo', [_qdPuzzleIds[0]]));

    phoenix.send(stateService.sessionCreate('cssqd', participantIds[0], 'rs.krakow', cssqdPuzzleIds.slice(1)));
    phoenix.send(stateService.sessionCreate('cssqd', participantIds[0], 'rs.krakow-demo', [cssqdPuzzleIds[0]]));
    phoenix.send(stateService.sessionCreate('cssqd', participantIds[0], 'lvivjs', cssqdPuzzleIds.slice(1)));
    phoenix.send(stateService.sessionCreate('cssqd', participantIds[0], 'lvivjs-demo', [cssqdPuzzleIds[0]]));
}

function createPuzzles(puzzles, puzzleIds) {
    return new Promise((resolve) => {
        function onPuzzleCreated(incomingMessage) {
            const { message } = parseMessage(incomingMessage.data);

            if (message.name !== 'puzzle.created') {
                return;
            }

            console.log('[init-service]', 'created puzzle', message.puzzleId);
            puzzleIds.push(message.puzzleId);

            if (puzzleIds.length === puzzles.length) {
                phoenix.off('message', onPuzzleCreated);
                resolve();
            }
        }

        phoenix.on('message', onPuzzleCreated);

        puzzles.forEach(puzzle => {
            phoenix.send(stateService.puzzleCreate(puzzle));
        });
    });
}

function createParticipant(user) {
    return new Promise((resolve) => {
        function onParticipantCreated(incomingMessage) {
            const { message } = parseMessage(incomingMessage.data);

            if (message.name !== 'participant.created') {
                return;
            }

            console.log('[init-service]', 'created participant', message.participantId);
            participantIds.push(message.participantId);
            phoenix.off('message', onParticipantCreated);
            resolve();
        }

        phoenix.on('message', onParticipantCreated);

        phoenix.send(frontService.createParticipant(user));
    });
}

function createParticipantsInOrder(users) {
    return new Promise((resolve) => {
        return createParticipant(users.shift())
            .then(() => {
                if (!users.length) {
                    return resolve();
                }

                return createParticipantsInOrder(users)
                    .then(resolve);
            });
    });
}

function createParticipants(users) {
    const usersCopy = Array.from(users);

    return createParticipantsInOrder(usersCopy);
}

phoenix
    .on('connected', () => {
        console.log('[init-service]', 'phoenix is alive');
        phoenix.send(arnaux.checkin('init-service'));

        createPuzzles(_qdPuzzles, _qdPuzzleIds)
            .then(() => {
                return createPuzzles(cssqdPuzzles, cssqdPuzzleIds);
            })
            .then(() => {
                return createParticipants(users);
            })
            .then(() => {
                return createSessions();
            });
    })
    .on('disconnected', () => {
        console.error('[init-service]', 'phoenix disconnected');
    })
    .on('message', (incomingMessage) => {
        const { message } = parseMessage(incomingMessage.data);

        switch (message.name) {
            case 'session.created':
                console.log('[init-service]', 'created session', message.sessionId);
                break;

            default:
                console.log('[init-service]', 'unhandled message', message.name);
        }
    });
