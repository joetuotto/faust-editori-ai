export class StorageManager {
  static saveProject(project) {
    try {
      const data = JSON.stringify(project);
      if (data.length > 5000000) {
        console.warn('Project too large for localStorage');
        return { success: false, error: 'Project too large' };
      }
      localStorage.setItem('projectData', data);
      return { success: true };
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        return { success: false, error: 'Storage full' };
      }
      return { success: false, error: e.message };
    }
  }

  static loadProject() {
    try {
      const data = localStorage.getItem('projectData');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Load error:', e);
      return null;
    }
  }

  static exportProject(project, filename) {
    const dataStr = JSON.stringify(project, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = filename || `FAUST-project-${Date.now()}.json`;
    link.click();
  }
}

















