# Deploying to Render

This guide will help you deploy your Flask OCR application to Render.

## Prerequisites

1. A GitHub account
2. A Render account (sign up at https://render.com)
3. Your code pushed to a GitHub repository

## Step-by-Step Deployment

### 1. Prepare Your Repository

Make sure your repository contains these files:
- `app.py` (your Flask application)
- `requirements.txt` (with all dependencies including gunicorn)
- `Procfile` (tells Render how to run your app)
- `runtime.txt` (specifies Python version)
- `templates/` folder with your HTML templates
- `static/` folder with your CSS, JS, and other static files

### 2. Create a New Web Service on Render

1. Log in to your Render dashboard
2. Click "New +" and select "Web Service"
3. Connect your GitHub account if you haven't already
4. Select your repository from the list
5. Choose a name for your service (e.g., "flask-ocr-app")

### 3. Configure Your Service

Use these settings:

**Build Command:**
```bash
pip install -r requirements.txt
```

**Start Command:**
```bash
gunicorn app:app
```

**Environment:**
- Python 3.11.9 (automatically detected from runtime.txt)

### 4. Environment Variables (Optional)

You can set these environment variables in the Render dashboard:

- `FLASK_DEBUG`: Set to `false` for production
- `PORT`: Automatically set by Render (don't change this)

### 5. Deploy

1. Click "Create Web Service"
2. Render will automatically build and deploy your application
3. The build process may take several minutes due to the OCR dependencies (easyocr, opencv, etc.)
4. Once deployed, you'll get a URL like `https://your-app-name.onrender.com`

## Important Notes

### OCR Dependencies
Your app uses several heavy dependencies for OCR:
- `easyocr` - for optical character recognition
- `opencv-python-headless` - for image processing
- `pypdfium2` - for PDF rendering

These will increase your build time and memory usage. Render's free tier should handle this, but if you experience issues, consider:
- Using a paid Render plan for better performance
- Implementing lazy loading for OCR features
- Adding error handling for OCR failures

### File Storage
- Your app stores uploaded PDFs in the `static/uploads` directory
- On Render, this is ephemeral storage that gets reset on each deployment
- For production, consider using:
  - AWS S3 for file storage
  - Render's persistent disk (paid feature)
  - A database to store file metadata

### Performance Considerations
- The free tier has limited resources
- OCR processing can be CPU-intensive
- Consider adding request timeouts and error handling
- Monitor your app's performance in the Render dashboard

## Troubleshooting

### Build Failures
- Check that all dependencies are in `requirements.txt`
- Ensure Python version in `runtime.txt` is supported
- Look at build logs for specific error messages

### Runtime Errors
- Check the service logs in Render dashboard
- Ensure all file paths are relative, not absolute
- Verify that all required directories are created

### Styling Issues (Buttons look like default HTML)
If buttons appear as default HTML buttons instead of styled ones:

1. **Check CSS loading**: Visit `https://your-app.onrender.com/debug/static` to verify static files are accessible
2. **Clear browser cache**: Hard refresh (Ctrl+F5) to reload CSS
3. **Check browser console**: Look for 404 errors on CSS/JS files
4. **Fallback styles**: The app includes inline CSS as fallback, so basic styling should work
5. **Static file serving**: The app has explicit routes for CSS and JS files

### OCR Issues
- OCR may fail on the free tier due to memory constraints
- Add error handling for OCR failures
- Consider implementing a fallback mechanism

## Monitoring

- Use Render's built-in monitoring dashboard
- Set up alerts for service downtime
- Monitor memory and CPU usage
- Check logs regularly for errors

## Scaling

If you need more resources:
- Upgrade to a paid Render plan
- Consider using Render's auto-scaling features
- Implement caching for frequently accessed data
- Use a CDN for static assets

## Security

- Never commit sensitive data to your repository
- Use environment variables for configuration
- Implement proper error handling to avoid exposing internal details
- Consider adding authentication if needed

## Support

- Render documentation: https://render.com/docs
- Render community: https://community.render.com
- Check Render status page for service issues
