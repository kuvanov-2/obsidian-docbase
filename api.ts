export async function getDocBaseNote(accessToken: string, teamId: string, noteId: string) {
    const url = `https://api.docbase.io/teams/${teamId}/posts/${noteId}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-DocBaseToken': accessToken,
        },
    });

    return response;
}

export async function pushDocBaseNote(
    accessToken: string,
    teamId: string,
    requestBody: { title: string; body: string; draft: boolean;  },
    noteId?: string
) {
    const url = `https://api.docbase.io/teams/${teamId}/posts/${noteId ? noteId : ''}`;
    const method = noteId ? 'PUT' : 'POST';

    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-DocBaseToken': accessToken,
        },
        body: JSON.stringify(requestBody),
    });

    return response;
}
