export async function getDocBaseNote(accessToken: string, teamId: string, noteId: string) {
    const response = await fetch(`https://api.docbase.io/teams/${teamId}/posts/${noteId}`, {
        headers: {
            'X-DocBaseToken': accessToken
        }
    });

    if (!response.ok) {
        throw new Error('Network response was not ok');
    }

    const data = await response.json();
    return {
        title: data.title,
        body: data.body,
        tags: data.tags.map((tag: any) => ({ name: tag.name })),
        draft: data.draft
    };
}

export async function pushDocBaseNote(accessToken: string, teamId: string, noteId: string, requestBody: any) {
    const response = await fetch(`https://api.docbase.io/teams/${teamId}/posts/${noteId}`, {
        method: 'PATCH',
        headers: {
            'X-DocBaseToken': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        throw new Error('Network response was not ok');
    }

    return await response.json();
}
