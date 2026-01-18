document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('poetryForm');
    const previewContainer = document.getElementById('previewContainer');
    const downloadBtn = document.getElementById('downloadBtn');
    const renderContainer = document.getElementById('renderContainer');

    // Constants based on CSS
    const CARD_WIDTH = 1080;
    const CARD_HEIGHT = 1350;
    const CONTENT_PADDING_TOP = 120; // from .poem-card padding
    const CONTENT_PADDING_BOTTOM = 120; // estimate
    const HEADER_HEIGHT_ESTIMATE = 350; // Approximated height of header section including margins
    const FOOTER_HEIGHT = 100;

    // We'll calculate the actual available height for text dynamically just to be safe,
    // but a rough max height per page is useful. 
    // Total Height (1350) - Padding (240) - Header (varies) - Footer (100)

    let generatedCanvases = [];
    let generatedFileNames = [];

    // Auto-fill today's date
    document.getElementById('date').valueAsDate = new Date();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('generateBtn');
        const originalText = btn.textContent;
        btn.textContent = '글꼴 로딩 및 생성 중...';
        btn.disabled = true;

        await document.fonts.ready; // Ensure fonts are loaded for correct measurement

        // 1. Gather Data
        const data = {
            date: document.getElementById('date').value, // yyyy-mm-dd
            title: document.getElementById('title').value,
            author: document.getElementById('author').value,
            content: document.getElementById('content').value
        };

        // 2. Clear previous
        previewContainer.innerHTML = '';
        generatedCanvases = [];
        generatedFileNames = [];
        downloadBtn.disabled = true;
        downloadBtn.textContent = '다운로드'; // Reset in case it was stuck

        try {
            // 3. Process Logic (Pagination)
            const pages = paginateText(data);

            // 4. Render to DOM (Preview)
            renderPages(pages, data);

            // 5. Enable Download
            downloadBtn.disabled = false;
        } catch (err) {
            console.error(err);
            alert('생성 중 오류가 발생했습니다.');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }

        // 6. Make preview responsive
        adjustPreviewScale();
    });

    window.addEventListener('resize', adjustPreviewScale);

    downloadBtn.addEventListener('click', async () => {
        if (generatedCanvases.length === 0) {
            // If they modify text but don't re-generate, we should re-generate or warn.
            // For now, assume they clicked generate first. 
            // Better UX: clicking download triggers generation if needed.
            // But let's stick to the flow: Generate -> Download.

            // Re-render hidden elements for html2canvas to capture cleanly
            // (Sometimes capturing scaled elements in preview causes issues)
            await generateImagesForDownload();
        } else {
            await downloadImages();
        }
    });

    function paginateText(data) {
        // Create a dummy container to measure text height
        const dummyHost = document.createElement('div');
        dummyHost.style.position = 'absolute';
        dummyHost.style.visibility = 'hidden';
        dummyHost.style.width = `${CARD_WIDTH}px`; // Exact width
        // Must match CSS .poem-card exactly
        dummyHost.style.fontFamily = "'Eulyoo1945', serif";
        dummyHost.style.fontSize = '36px';
        dummyHost.style.lineHeight = '2';
        dummyHost.style.padding = '0 100px'; // horizontal padding only for width constraint
        dummyHost.style.boxSizing = 'border-box';
        dummyHost.style.whiteSpace = 'pre-wrap';
        dummyHost.style.wordBreak = 'keep-all';

        document.body.appendChild(dummyHost);

        const lines = data.content.split('\n');
        const pages = [];
        let currentPageLines = [];

        // Calculate max height for text body
        // Unlike header, the body height depends on how much space is left.
        // Let's create a temporary card to measure the header height precisely.
        const tempHeader = createCardElement(data, [], 1, 1).querySelector('.card-header');
        document.body.appendChild(tempHeader);
        // We need to style it to get correct height
        tempHeader.style.width = `${CARD_WIDTH - 200}px`; // accounting for padding
        const headerHeight = tempHeader.offsetHeight;
        document.body.removeChild(tempHeader);

        // Available height for content
        // 1350 - 120(top pad) - HeaderHeight - 30(gap) - BodyBottomPadding? - 60(FooterPos) - FooterHeight
        // Let's being conservative.
        // Padding Top: 120
        // Header height: varies ~200-300
        // Gap: 80 (margin-bottom of header)
        // Footer space: ~100
        // Padding Bottom: 120

        const AVAILABLE_HEIGHT = CARD_HEIGHT - 120 - headerHeight - 100 - 120;

        let currentHeight = 0;

        for (let line of lines) {
            // Check height of this line
            dummyHost.textContent = currentPageLines.concat([line]).join('\n');
            const newHeight = dummyHost.offsetHeight;

            if (newHeight > AVAILABLE_HEIGHT && currentPageLines.length > 0) {
                // If adding this line exceeds height, push current page and start new
                pages.push(currentPageLines.join('\n'));
                currentPageLines = [line];

                // Recalculate height for just this line
                dummyHost.textContent = line;
                currentHeight = dummyHost.offsetHeight;
            } else {
                currentPageLines.push(line);
                currentHeight = newHeight;
            }
        }

        if (currentPageLines.length > 0) {
            pages.push(currentPageLines.join('\n'));
        }

        document.body.removeChild(dummyHost);
        return pages;
    }

    function createCardElement(data, contentLines, pageIndex, totalPages) {
        const card = document.createElement('div');
        card.className = 'poem-card';

        // Header
        const header = document.createElement('div');
        header.className = 'card-header';

        const dateDiv = document.createElement('div');
        dateDiv.className = 'card-date';
        // Format date: 2026-01-06 -> 2026. 01. 06
        const dateParts = data.date.split('-');
        if (dateParts.length === 3) {
            dateDiv.textContent = `${dateParts[0]}. ${dateParts[1]}. ${dateParts[2]}`;
        } else {
            dateDiv.textContent = data.date;
        }

        const titleDiv = document.createElement('div');
        titleDiv.className = 'card-title';
        titleDiv.textContent = data.title;

        const authorDiv = document.createElement('div');
        authorDiv.className = 'card-author';
        authorDiv.textContent = data.author;

        header.appendChild(dateDiv);
        header.appendChild(titleDiv);
        header.appendChild(authorDiv);
        card.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'card-body';
        body.textContent = contentLines; // Safe text
        card.appendChild(body);

        // Footer (Pagination) - Only if totalPages > 1
        if (totalPages > 1) {
            const footer = document.createElement('div');
            footer.className = 'card-footer';
            // Logic for file name text? No, requirement says:
            // "페이지가 넘어가게 되는 경우 '2026_01_06 (1).png' ... 이미지 처럼 하단에 페이징이 보여야함"
            // Usually this means "1 / 3" or similar.
            // Or does it mean the filename itself? "이미지 처럼"?
            // "이미지 처럼 하단에 페이징이 보여야함" -> "Pagination should be visible at the bottom like in the image '2026_01_06 (1).png'"
            // I'll assume standard 1/N format.
            footer.textContent = `${pageIndex + 1} / ${totalPages}`;
            card.appendChild(footer);
        }

        return card;
    }

    function renderPages(pages, data) {
        pages.forEach((pageContent, index) => {
            const card = createCardElement(data, pageContent, index, pages.length);
            // Append to preview
            // We wrapper it to scale it
            previewContainer.appendChild(card);
        });
    }

    function adjustPreviewScale() {
        const pContainer = document.querySelector('.preview-container');
        const cards = document.querySelectorAll('.poem-card');
        if (cards.length === 0) return;

        const containerWidth = document.querySelector('.preview-area').clientWidth - 40; // padding
        const scale = Math.min(1, containerWidth / CARD_WIDTH);

        cards.forEach(card => {
            card.style.transform = `scale(${scale})`;
            card.style.transformOrigin = 'top center';
            // We need to adjust margin bottom because scaling doesn't affect flow layout space
            const marginBottom = -(CARD_HEIGHT * (1 - scale));
            card.style.marginBottom = `${marginBottom + 20}px`; // +20 for gap
        });
    }

    async function generateImagesForDownload() {
        // We render clones into the hidden #renderContainer to capture them at full scale
        renderContainer.innerHTML = '';

        // Re-get data (or pass it) - simpler to just grab from DOM or store it.
        // Let's assume the previewContainer has the correct elements already, 
        // but `html2canvas` is flaky with `transform: scale`.
        // So we Clone the text content from preview and re-render in hidden div.

        const previewCards = document.querySelectorAll('#previewContainer .poem-card');
        const cleanCards = [];

        previewCards.forEach(pc => {
            const clone = pc.cloneNode(true);
            clone.style.transform = 'none';
            clone.style.marginBottom = '0';
            clone.style.boxShadow = 'none'; // Remove shadow for export
            renderContainer.appendChild(clone);
            cleanCards.push(clone);
        });

        generatedCanvases = [];
        generatedFileNames = [];

        // Generate Filename Base
        // '2026_01_06'
        const dateRaw = document.getElementById('date').value;
        const dateStr = dateRaw.replace(/-/g, '_'); // 2026_01_06

        downloadBtn.textContent = '이미지 처리 중...';

        for (let i = 0; i < cleanCards.length; i++) {
            const card = cleanCards[i];

            // Wait a tiny bit for the clone to layout reliably in the new container
            await new Promise(r => setTimeout(r, 100));

            const canvas = await html2canvas(card, {
                scale: 1, // Exact 1080p
                backgroundColor: '#323232', // Ensure bg is captured
                useCORS: true, // Critical for fonts from CDN
                allowTaint: true
            });

            generatedCanvases.push(canvas);

            let filename = `${dateStr}.png`;
            if (cleanCards.length > 1) {
                filename = `${dateStr} (${i + 1}).png`;
            }
            generatedFileNames.push(filename);
        }

        renderContainer.innerHTML = ''; // Cleanup

        await downloadImages();

        downloadBtn.textContent = '다운로드';
    }

    async function downloadImages() {
        if (generatedCanvases.length === 0) return;

        if (generatedCanvases.length === 1) {
            // Single file download
            generatedCanvases[0].toBlob((blob) => {
                saveAs(blob, generatedFileNames[0]);
            });
        } else {
            // Zip download
            const zip = new JSZip();

            const promises = generatedCanvases.map((canvas, i) => {
                return new Promise(resolve => {
                    canvas.toBlob(blob => {
                        zip.file(generatedFileNames[i], blob);
                        resolve();
                    });
                });
            });

            await Promise.all(promises);

            const content = await zip.generateAsync({ type: "blob" });
            const dateStr = document.getElementById('date').value.replace(/-/g, '_');
            saveAs(content, `${dateStr}_poems.zip`);
        }
    }
});
