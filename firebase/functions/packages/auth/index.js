const admin = require('firebase-admin');
const functions = require('firebase-functions');
const cors = require('cors')({
    origin: true,
});


const customAuth = (req, res) => {
    return cors(req, res, async () => {
        const user = await admin.auth().getUserByEmail(req.query.user);
        if (req.query.token !== functions.config().tests.key) {
            console.error('[ERROR] Token did not match functions config tests' +
                ' key.');
            return res.status(401).send('[ERROR] Token did not match ' +
                'functions config tests key.');
        }
        return admin.auth().createCustomToken(user.uid).then((token) => {
            console.log('[DEBUG] Created custom auth token for user (' +
                user.uid + ').');
            return res.status(200).json(token);
        }).catch((err) => {
            console.error('[ERROR] While creating custom auth token:', err);
            return res.status(500).send('[ERROR] ' + err.message);
        });
    });
};


const updateAuth = async (change, context) => {
    const profile = change.after.data();
    const id = context.params.id;
    if (!profile)
        return console.warn('User (' + id + ') doc was deleted.');
    if (!profile.uid)
        return console.warn('User (' + id + ') did not have a uID.');
    const db = admin.firestore().collection('partitions').doc('default');

    // Check to see if the supervisor's id is in the codes collection
    const supervisorCodes = await db.collection('auth')
        .doc('supervisors')
        .get();
    var validIDs = [
        'OAmavOtc6GcL2BuxFJu4sd5rwDu1',
        '0vDQRIl7pJUmTzb4Rf4FRl6tCXj1',
        'XXuoSC6QxTashOXvBwZEPz8QHWB3',
        'YVMZlf3GMtcidSG1ud8faCgWMwk2',
    ];
    if (supervisorCodes.exists) {
        Object.entries(supervisorCodes.data()).forEach((entry) => {
            validIDs.push(entry[1]);
        });
    } else {
        console.warn('Supervisor auth codes do not exist, falling back to ' +
            'default IDs...');
        validIDs = validIDs.concat([
            'supervisor@tutorbook.app',
            'mlim@pausd.org',
            'psteward@pausd.org',
            'lcollart@pausd.org',
        ]);
    }
    if (profile.type === 'Supervisor' && profile.authenticated &&
        validIDs.indexOf(id) >= 0) { // SUPERVISOR
        console.log(profile.name + ' was a verified supervisor. ' +
            'Adding customAuth claims...');
        const locations = await db.collection('locations')
            .where('supervisors', 'array-contains', profile.uid)
            .get();
        var locationIDs = [];
        locations.forEach((doc) => {
            locationIDs.push(doc.id);
        });
        return admin.auth()
            .setCustomUserClaims(profile.uid, {
                supervisor: true,
                parent: false,
                locations: locationIDs,
                children: [],
            }).then(() => {
                console.log('Added supervisor customAuth to ' +
                    profile.name + '\'s account.');
            }).catch((err) => {
                console.error('Error while adding ' +
                    'supervisor customAuth to ' + profile.name +
                    '\'s account:', err.message);
            });
    } else { // NOTHING
        console.log(profile.name + ' was not a verified supervisor. ' +
            'Ensuring that they don\'t have customAuth claims...');
        return admin.auth()
            .setCustomUserClaims(profile.uid, {
                supervisor: false,
                parent: false,
                locations: [],
                children: [],
            })
            .then(() => {
                console.log('Removed any customAuth claims from ' +
                    profile.name + '\'s account.');
            }).catch((err) => {
                console.error('Error while removing customAuth claims' +
                    ' from ' + profile.name + '\'s account:', err.message);
            });
    }
};


module.exports = {
    update: updateAuth,
    custom: customAuth,
};