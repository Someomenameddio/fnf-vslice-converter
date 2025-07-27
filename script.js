// ====== CONFIGURATION ======
const SUPPORTED_FILES = [".json", ".ogg", ".png", ".zip"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ====== MAIN CONVERTER CLASS ======
class FNFConverter {
    constructor() {
        this.files = [];
        this.vsliceStructure = {
            songs: [],
            data: [],
            images: []
        };
    }

    // ====== MAIN PROCESSING FLOW ======
    async processFiles(files) {
        try {
            this.updateUI(10, "Checking files...");
            
            // Validate files
            this.validateFiles(files);
            
            // Extract ZIP if present
            if (this.hasArchive()) {
                await this.extractArchive();
            }
            
            // Organize files
            await this.organizeFiles();
            
            // Convert charts
            await this.convertCharts();
            
            // Create final package
            return await this.createVSliceZip();
            
        } catch (error) {
            this.showError(error.message);
            throw error;
        }
    }

    // ====== PROCESSING METHODS ======
    validateFiles(files) {
        if (!files || files.length === 0) {
            throw new Error("No files selected");
        }
        
        this.files = Array.from(files).filter(file => {
            // Check file type
            const isValidType = SUPPORTED_FILES.some(ext => 
                file.name.toLowerCase().endsWith(ext)
            );
            
            // Check file size
            const isValidSize = file.size <= MAX_FILE_SIZE;
            
            if (!isValidType) {
                console.warn(`Unsupported file type: ${file.name}`);
            }
            if (!isValidSize) {
                console.warn(`File too large: ${file.name}`);
            }
            
            return isValidType && isValidSize;
        });
        
        if (this.files.length === 0) {
            throw new Error("No supported files found");
        }
    }

    hasArchive() {
        return this.files.some(f => f.name.endsWith('.zip'));
    }

    async extractArchive() {
        this.updateUI(20, "Extracting archive...");
        
        const zipFile = this.files.find(f => f.name.endsWith('.zip'));
        if (!zipFile) return;
        
        try {
            const zip = new JSZip();
            const content = await zip.loadAsync(zipFile);
            
            // Convert all files in the ZIP to our working files
            const zipFiles = await Promise.all(
                Object.keys(content.files)
                    .filter(name => !content.files[name].dir)
                    .map(async name => {
                        const fileData = await content.files[name].async('blob');
                        return new File([fileData], name);
                    })
            );
            
            // Replace ZIP with its contents
            this.files = [...this.files.filter(f => f !== zipFile), ...zipFiles];
            
        } catch (error) {
            throw new Error("Failed to extract ZIP file");
        }
    }

    organizeFiles() {
        this.updateUI(40, "Organizing files...");
        
        this.vsliceStructure = {
            songs: this.files.filter(f => 
                f.name.endsWith('.ogg') || f.name.includes('/songs/')
            ),
            data: this.files.filter(f => 
                f.name.endsWith('.json') || f.name.includes('/data/')
            ),
            images: this.files.filter(f => 
                f.name.endsWith('.png') || f.name.includes('/images/')
            )
        };
    }

    async convertCharts() {
        this.updateUI(60, "Converting charts...");
        
        for (const file of this.vsliceStructure.data) {
            if (file.name.endsWith('.json')) {
                try {
                    const content = await file.text();
                    const chart = JSON.parse(content);
                    file.converted = this.convertToVSlice(chart);
                } catch (error) {
                    console.error(`Chart conversion failed for ${file.name}:`, error);
                    file.conversionError = true;
                }
            }
        }
    }

    convertToVSlice(fnfChart) {
        // Basic conversion - expand this for your needs
        return {
            metadata: {
                name: fnfChart.song || "Unknown",
                bpm: fnfChart.bpm || 100,
                speed: fnfChart.speed || 1
            },
            notes: (fnfChart.notes || []).map(note => ({
                time: note.strumTime,
                type: note.noteType || "default",
                direction: note.direction || "middle",
                length: note.sustainLength || 0
            }))
        };
    }

    async createVSliceZip() {
        this.updateUI(80, "Creating package...");
        
        const zip = new JSZip();
        const vslice = zip.folder("vslice_mod");
        
        // Helper function to add files to folders
        const addFiles = (files, folderName) => {
            files.forEach(file => {
                if (!file.conversionError) {
                    const content = file.converted ? 
                        JSON.stringify(file.converted, null, 2) : file;
                    vslice.file(`${folderName}/${file.name}`, content);
                }
            });
        };
        
        addFiles(this.vsliceStructure.songs, "songs");
        addFiles(this.vsliceStructure.data, "data");
        addFiles(this.vsliceStructure.images, "images");
        
        this.updateUI(90, "Finalizing...");
        const content = await zip.generateAsync({ type: "blob" });
        return new File([content], "vslice_mod.zip");
    }

    // ====== UI METHODS ======
    updateUI(progress, message) {
        document.querySelector('progress').value = progress;
        document.getElementById('status').textContent = message;
    }

    showError(message) {
        const errorElement = document.getElementById('error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => errorElement.style.display = 'none', 5000);
    }
}

// ====== UI EVENT HANDLERS ======
document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('fileInput');
    const progressSection = document.getElementById('progress');
    const resultSection = document.getElementById('result');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Highlight drop area
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.style.borderColor = '#f72585';
    }
    
    function unhighlight() {
        dropArea.style.borderColor = '#4cc9f0';
    }
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFileSelect, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
    
    function handleFileSelect(e) {
        handleFiles(e.target.files);
    }
    
    async function handleFiles(files) {
        progressSection.style.display = 'block';
        resultSection.style.display = 'none';
        document.getElementById('error').style.display = 'none';
        
        try {
            const converter = new FNFConverter();
            const result = await converter.processFiles(files);
            
            document.getElementById('downloadBtn').onclick = () => {
                saveAs(result, result.name);
            };
            
            resultSection.style.display = 'block';
        } catch (error) {
            console.error("Conversion failed:", error);
        }
    }
});