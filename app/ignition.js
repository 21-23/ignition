const WebSocketClient = require('uws');
const createPhoenix = require('phoenix');
const { protocol: {frontService, stateService}, parseMessage, arnaux } = require('message-factory');

const phoenix = createPhoenix(WebSocketClient, { uri: 'ws://messenger:3000', timeout: 500 });

const puzzles = require('../data/puzzles.json');
const users = require('../data/qd-masters.json');

const puzzleIds = [];
const participantIds = [];

const sessionAliasSuffixes = ['dq', 'kk', 'ms', 'av', 'ay']; // order here MUST be the same as in ../data/qd-masters.json

function createSessions() {
    participantIds.forEach((participantId, index) => {
        const alias = `_qd-dev-${sessionAliasSuffixes[index]}`;
        phoenix.send(stateService.sessionCreate(participantId, alias, puzzleIds));
    });

    phoenix.send(stateService.sessionCreate(participantIds[0], 'rs.krakow', puzzleIds.slice(1)));
    phoenix.send(stateService.sessionCreate(participantIds[0], 'rs.krakow-demo', [puzzleIds[0]]));
    phoenix.send(stateService.sessionCreate(participantIds[0], 'lvivjs', puzzleIds.slice(1)));
    phoenix.send(stateService.sessionCreate(participantIds[0], 'lvivjs-demo', [puzzleIds[0]]));
}

function createPuzzles(puzzles) {
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

        createPuzzles(puzzles)
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
