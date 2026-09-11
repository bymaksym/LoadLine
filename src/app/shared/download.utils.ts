/** Triggers a download of a text file. Nothing leaves the browser: the file is built here. */
export const download = (name: string, text: string, type: string): void => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
