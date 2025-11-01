const form = document.getElementById('uploadForm');
const pdfViewer = document.getElementById('pdfViewer');

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(form);

    //Check if file is selected
    const file = formData.get('pdfFile');
    if (!file || !file.name) {
        alert('Please select a PDF file before uploading.');
        return;
    }
    //Immediate feedback
    //const loadingMessage = document.createElement('p');
    //loadingMessage.textContent = 'Uploading...';
    //form.appendChild(loadingMessage);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // Show the PDF in the iframe
            pdfViewer.src = result.fileUrl;
        } else {
            alert(result.message)
            location.reload(); //refresh page if error
        }
    } catch (error){
        alert("An unexpected error occured. Please try again.");
        location.reload();
    }
})