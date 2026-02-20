document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const statusBtn = document.getElementById('checkStatusBtn');

    // Handle file input display
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', function(e) {
            const fileName = this.files.length > 0 
                ? (this.files.length === 1 
                    ? this.files[0].name 
                    : `${this.files.length} files selected`)
                : '';
            
            const fileNameSpan = this.closest('.file-upload-area').querySelector('.file-name');
            if (fileNameSpan) {
                fileNameSpan.textContent = fileName;
            }
        });
    });

    // Handle form submission
    if (uploadForm) {
        uploadForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const statusDiv = document.getElementById('uploadStatus');
            
            try {
                statusDiv.className = 'upload-status';
                statusDiv.textContent = 'Uploading...';
                statusDiv.style.display = 'block';

                const response = await fetch('/api/application/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    statusDiv.className = 'upload-status success';
                    statusDiv.textContent = '✅ Documents uploaded successfully! You can track your application status.';
                    uploadForm.reset();
                    
                    // Clear file names
                    document.querySelectorAll('.file-name').forEach(span => {
                        span.textContent = '';
                    });
                } else {
                    throw new Error(result.error || 'Upload failed');
                }
            } catch (error) {
                statusDiv.className = 'upload-status error';
                statusDiv.textContent = '❌ Error: ' + error.message;
            }
        });
    }

    // Handle status check
    if (statusBtn) {
        statusBtn.addEventListener('click', async function() {
            const email = document.getElementById('statusEmail').value;
            const statusResult = document.getElementById('statusResult');
            const errorMessage = document.getElementById('errorMessage');

            if (!email) {
                showError('Please enter your email address');
                return;
            }

            try {
                const response = await fetch(`/api/application/status/${encodeURIComponent(email)}`);
                const result = await response.json();

                if (response.ok && result.success) {
                    displayStatus(result.status);
                    errorMessage.style.display = 'none';
                } else {
                    showError(result.error || 'Application not found');
                    statusResult.style.display = 'none';
                }
            } catch (error) {
                showError('Failed to check status. Please try again.');
            }
        });
    }

    function displayStatus(data) {
        document.getElementById('statusName').textContent = data.personalInfo.fullName;
        document.getElementById('statusEmailDisplay').textContent = data.personalInfo.email;
        document.getElementById('statusVisaType').textContent = data.personalInfo.visaType;
        document.getElementById('statusDate').textContent = new Date(data.timestamp).toLocaleDateString();

        // Update progress steps based on status
        const steps = {
            'received': ['completed', '', ''],
            'review': ['completed', 'active', ''],
            'processed': ['completed', 'completed', 'active']
        };

        const status = steps[data.status] || steps.received;
        
        document.querySelectorAll('.progress-step').forEach((step, index) => {
            step.className = `progress-step ${status[index]}`;
        });

        // Display uploaded documents
        const docsList = document.getElementById('uploadedDocs');
        docsList.innerHTML = '';
        
        Object.entries(data.uploadedFiles).forEach(([key, files]) => {
            const docDiv = document.createElement('div');
            docDiv.className = 'document-item';
            docDiv.innerHTML = `
                <p><strong>${formatDocName(key)}:</strong> ${files.map(f => f.originalName).join(', ')}</p>
            `;
            docsList.appendChild(docDiv);
        });

        document.getElementById('statusResult').style.display = 'block';
    }

    function showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    function formatDocName(key) {
        const names = {
            'passport': 'Passport',
            'photo': 'Photo',
            'cv': 'CV/Resume',
            'coverLetter': 'Cover Letter',
            'qualifications': 'Qualifications',
            'experience': 'Experience Letters'
        };
        return names[key] || key;
    }
});