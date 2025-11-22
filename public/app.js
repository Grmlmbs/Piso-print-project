const form = document.getElementById('uploadForm');
const preview = document.getElementById('preview');
const clearButton = document.querySelector("button[type='clear']");
const fileInput = form.querySelector("input[type='file']");
const uploadButton = form.querySelector("button[type='submit']");
const pageMode = document.getElementById("pageMode");
const pagesInput = document.getElementById("pages");

let lastUploadedBaseName = null;

function resetForm() {
    form.reset();
    preview.innerHTML = "";
    disabledInputs();
    uploadButton.disabled = false;
    totalPages = 0;
    allPagesImages = { letter: [], legal: [] };
    pagesInput.disabled = true;

    // Delete the last uploaded PDF and cache.
    if (lastUploadedBaseName) {
        fetch(`/delete-last/${lastUploadedBaseName}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => console.log('Previous files deleted:', data))
            .catch(err => console.error(err));
        lastUploadedBaseName = null;
    }
}

fileInput.addEventListener("change", () => {
    if (uploadButton.disabled && lastUploadedBaseName) {
        // User selected a new file, delete previous one.
        fetch(`/delete-last/${lastUploadedBaseName}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => console.log('Previous files deleted:', data))
            .catch(err => console.error(err));

        uploadButton.disabled = false; // allow new upload
        // Optionally clear preview if you want
        // preview.innerHTML = "";
        totalPages = 0;
        allPagesImages = { letter: [], legal: [] };
        disabledInputs();
        updatePagesTextboxState();
        lastUploadedBaseName = null;
    }
});

clearButton.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm();
});

function disabledInputs() {
    document.querySelectorAll("#settings input").forEach(i =>
        i.disabled = true
    );
}
function enableInputs() {
    document.querySelectorAll("#settings input").forEach(i =>
        i.disabled = false
    );
}
disabledInputs();

let totalPages = 0;

// page mode logic

function updatePagesTextboxState() {
    if (pageMode.value === "custom") {
        pagesInput.disabled = false;
    } else {
        pagesInput.disabled = true;
    }
}

// Filter pages
function parsePageSelection(input, totalPages) {
    if (!input) return [];

    let corrected = false;
    const ranges = input.split(",").map(p => p.trim());
    const pages = new Set();
    const correctedParts = [];

    for (let part of ranges) {
        
        if (/^\d+-\d+$/.test(part)) {
            let [start, end] = part.split("-").map(Number);

            // Correct invalid low numbers
            if (start < 1) { start = 1; corrected = true; }
            if (end < 1) { end = 1; corrected = true; }

            // Swap if reversed
            if (start > end) {
                [start, end] = [end, start];
                corrected = true;
            }

            // Trim to max pages 
            if (start > totalPages) {
                start = totalPages;
                corrected = true;
            }

            if (end > totalPages) {
                end = totalPages;
                corrected = true;
            }

            correctedParts.push(`${start}-${end}`);

            for (let i = start; i <= end; i++) pages.add(i);
            continue;
        }

        if (/^\d+$/.test(part)) {
            let num = Number(part);

            if (num < 1) { num = 1; corrected = true; }
            if (num > totalPages) { num = totalPages; corrected = true; }

            correctedParts.push(String(num));
            pages.add(num);
            continue;
        }
    }

    // Apply autocorrected version back to the textbox
    if (corrected) {
        pagesInput.value = correctedParts.join(", ");
        showCorrectionMessage();
    }

    return [...pages];
}

function getSelectedPages() {
    if (!totalPages) return [];

    switch (pageMode.value) {
        case "all":
            return [...Array(totalPages).keys()].map(i => i + 1);
        
        case "odd":
            return [...Array(totalPages).keys()]
                .map(i => i + 1)
                .filter(n => n % 2 !== 0);

        case "even":
            return [...Array(totalPages).keys()]
                .map(i => i + 1)
                .filter(n => n % 2 === 0);

        case "custom":
            return parsePageSelection(pagesInput.value, totalPages);

        default:
            return [];
    }
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(form);

    const file = formData.get('pdfFile');
    if (!file || !file.name) {
        alert('Please select a PDF file before uploading.');
        return;
    }

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success && result.images) {
            lastUploadedBaseName = result.baseName;
            handlePreviewImages(result.images);
            totalPages = result.totalPages;
            enableInputs();
            updatePagesTextboxState();
            uploadButton.disabled = true;
            if (result.originalSize === "letter") {
                document.querySelector("input[value='letter']").checked = true;
            } else if (result.originalSize === 'legal') {
                document.querySelector("input[value='legal']").checked = true;
            }

            updatePreview();
        } else {
            alert(result.message || "Upload failed");
        }

    } catch (error){
        console.error('Upload/convert error:', error);
        alert("An unexpected error occurred. Please try again.");
    }
});

// Render preview
function renderPreview(allPages, selectedPages, color, paperSize) {
    preview.innerHTML = "";

    if (!allPages || allPages.length === 0) {
        preview.innerHTML = "<p> The specified page is not available.</p>";
        return;
    }
    selectedPages.forEach(pageNum => {
        const imgSrc = allPages[pageNum - 1];

        if (!imgSrc) {
            preview.innerHTML = `<p style="color:red;">
                Invalid page selection. Your document has only ${allPages.length} pages.
            </p>`;
            return;
        }
        
        const img = document.createElement("img");
        img.src = imgSrc;
        img.classList.add("PaperSize");

        if (color === "bw") img.classList.add("bw");
        //img.classList.add(paperSize);


        preview.appendChild(img);
    });
}

let allPagesImages = { letter: [], legal: []};

function handlePreviewImages(images) {
    allPagesImages = images;
    totalPages = images.letter.length;
}
function showCorrectionMessage() {
    preview.innerHTML = `
        <p style="color:orange;">
            Some page selections were automatically adjusted to fit (1-${totalPages}).
        </p>`;
}

function updatePreview() {
    const color = document.querySelector("input[name='color']:checked")?.value;
    const paper = document.querySelector("input[name='paperSize']:checked")?.value;

    if (!color || !paper || !totalPages) return;

    const selectedPages = getSelectedPages();

    // validation
    if (selectedPages.length === 0) {
        preview.innerHTML = `<p style="color:red;">
            Please enter valid page numbers (1 - ${totalPages}).
        </p>`;
        return;
    }

    const maxSelected = Math.max(...selectedPages);
    if (maxSelected > totalPages) {
        preview.innerHTML = `<p style="color:red;">
            Your document has only ${totalPages} pages.
        </p>`;
        return;
    }
    renderPreview(allPagesImages[paper], selectedPages, color);
}

pagesInput.addEventListener("input", updatePreview);

document
    .getElementById("copies")
    .addEventListener("input", updatePreview);

document.querySelectorAll("input[name='color']").forEach(el => 
    el.addEventListener("change", updatePreview)
);

document.querySelectorAll("input[name='paperSize']").forEach(el =>
    el.addEventListener("change", updatePreview)
);

pageMode.addEventListener("change", () => {
    updatePagesTextboxState();
    updatePreview();
});
