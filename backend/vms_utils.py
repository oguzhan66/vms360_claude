"""VMS utility functions"""
from typing import Optional, Dict, Any
import httpx
import xml.etree.ElementTree as ET
import logging

logger = logging.getLogger(__name__)


async def fetch_vms_data(vms: dict, endpoint: str) -> Optional[str]:
    """Fetch data from VMS server"""
    try:
        url = f"{vms['url']}{endpoint}"
        auth = None
        if vms.get('username'):
            auth = (vms['username'], vms.get('password', ''))
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, auth=auth if auth else None)
            if response.status_code == 200:
                return response.text
            else:
                logger.warning(f"VMS request failed: {response.status_code}")
                return None
    except Exception as e:
        logger.error(f"VMS fetch error: {str(e)}")
        return None


def parse_counter_xml(xml_data: str) -> Dict[str, Any]:
    """Parse counter data from VMS XML response"""
    try:
        root = ET.fromstring(xml_data)
        cameras = []
        
        # Try multiple XML formats
        # Format 1: <CameraState> with <CameraID>, <In>, <Out> (Sagitech format)
        for camera_state in root.findall('.//CameraState'):
            camera_id = camera_state.findtext('CameraID')
            if not camera_id:
                continue
            
            in_count = int(camera_state.findtext('In', '0') or '0')
            out_count = int(camera_state.findtext('Out', '0') or '0')
            last_reset = camera_state.findtext('LastResetTime', '')
            
            cameras.append({
                'camera_id': camera_id,
                'counters': [{'index': '0', 'in_count': in_count, 'out_count': out_count}],
                'last_reset': last_reset
            })
        
        # Format 2: <camera> with nested <counter> elements
        if not cameras:
            for camera in root.findall('.//camera') or root.findall('.//Camera'):
                camera_id = camera.get('id') or camera.get('cameraId') or camera.findtext('id') or camera.findtext('cameraId')
                if not camera_id:
                    continue
                
                counters = camera.findall('.//counter') or camera.findall('.//Counter')
                counter_data = []
                for counter in counters:
                    counter_data.append({
                        'index': counter.get('index', '0'),
                        'in_count': int(counter.findtext('in', '0') or counter.get('in', '0')),
                        'out_count': int(counter.findtext('out', '0') or counter.get('out', '0')),
                    })
                
                last_reset = camera.findtext('lastReset') or camera.findtext('last_reset') or camera.get('lastReset')
                
                cameras.append({
                    'camera_id': camera_id,
                    'counters': counter_data,
                    'last_reset': last_reset
                })
        
        return {'cameras': cameras, 'raw': xml_data[:500]}
    except ET.ParseError as e:
        logger.error(f"XML parse error: {str(e)}")
        return {'cameras': [], 'error': str(e)}


def parse_queue_xml(xml_data: str) -> Dict[str, Any]:
    """Parse queue data from VMS XML response"""
    try:
        root = ET.fromstring(xml_data)
        cameras = []
        
        # Format 1: Sagitech format <CameraState> with <ZoneStates>/<ZoneState>
        for camera_state in root.findall('.//CameraState'):
            camera_id = camera_state.findtext('CameraID')
            if not camera_id:
                continue
            
            zones = []
            for zone_state in camera_state.findall('.//ZoneState'):
                zones.append({
                    'zone_index': int(zone_state.findtext('ZoneIndex', '0') or '0'),
                    'queue_length': int(zone_state.findtext('QueueLength', '0') or '0'),
                    'is_queue': zone_state.findtext('IsQueue', 'false').lower() == 'true'
                })
            
            cameras.append({
                'camera_id': camera_id,
                'zones': zones
            })
        
        # Format 2: Generic format <camera> with <zone>
        if not cameras:
            for camera in root.findall('.//camera') or root.findall('.//Camera'):
                camera_id = camera.get('id') or camera.get('cameraId') or camera.findtext('id')
                if not camera_id:
                    continue
                
                zones = []
                for zone in camera.findall('.//zone') or camera.findall('.//Zone'):
                    zones.append({
                        'zone_index': int(zone.get('index', '0')),
                        'queue_length': int(zone.findtext('queueLength', '0') or zone.get('queueLength', '0')),
                        'is_queue': zone.findtext('isQueue', 'false').lower() == 'true'
                    })
                
                cameras.append({
                    'camera_id': camera_id,
                    'zones': zones
                })
        
        return {'cameras': cameras}
    except ET.ParseError as e:
        logger.error(f"Queue XML parse error: {str(e)}")
        return {'cameras': [], 'error': str(e)}


def parse_analytics_xml(xml_data: str) -> Dict[str, Any]:
    """Parse analytics (age/gender) data from VMS XML response
    
    Supports TWO formats:
    1. Sagitech Face Recognition format: <Items><Item><CameraID>...<Age>...<Gender>...
    2. Legacy format: <camera><detection><age>...<gender>...
    """
    try:
        root = ET.fromstring(xml_data)
        cameras = {}  # Use dict to group by camera_id
        
        # ========== FORMAT 1: Sagitech <Items><Item> format ==========
        # This is the actual format from /rsapi/modules/fr/searchevents
        for item in root.findall('.//Item') or root.findall('.//item'):
            camera_id = item.findtext('CameraID') or item.findtext('cameraId') or item.findtext('cameraid')
            if not camera_id:
                continue
            
            # Extract age and gender from each Item (each Item is a face detection event)
            age_str = item.findtext('Age') or item.findtext('age') or '0'
            gender = item.findtext('Gender') or item.findtext('gender') or 'Unknown'
            timestamp = item.findtext('Time') or item.findtext('time') or ''
            
            # Initialize camera entry if not exists
            if camera_id not in cameras:
                cameras[camera_id] = {
                    'camera_id': camera_id,
                    'camera_name': item.findtext('CameraName') or item.findtext('cameraName') or '',
                    'detections': []
                }
            
            # Add this detection
            try:
                age = int(float(age_str)) if age_str else 0
            except (ValueError, TypeError):
                age = 0
                
            cameras[camera_id]['detections'].append({
                'age': age,
                'gender': gender,
                'timestamp': timestamp
            })
        
        # If we found Items, return them
        if cameras:
            return {'cameras': list(cameras.values())}
        
        # ========== FORMAT 2: Legacy <camera><detection> format ==========
        for camera in root.findall('.//camera') or root.findall('.//Camera'):
            camera_id = camera.get('id') or camera.get('cameraId') or camera.findtext('id')
            if not camera_id:
                continue
            
            analytics_data = {
                'camera_id': camera_id,
                'detections': []
            }
            
            for detection in camera.findall('.//detection') or camera.findall('.//Detection'):
                age_str = detection.findtext('age', '0')
                try:
                    age = int(float(age_str)) if age_str else 0
                except (ValueError, TypeError):
                    age = 0
                    
                analytics_data['detections'].append({
                    'age': age,
                    'gender': detection.findtext('gender', 'Unknown'),
                    'timestamp': detection.findtext('timestamp', '')
                })
            
            male_elem = camera.find('.//male') or camera.find('.//Male')
            female_elem = camera.find('.//female') or camera.find('.//Female')
            if male_elem is not None or female_elem is not None:
                analytics_data['summary'] = {
                    'male': int(male_elem.text if male_elem is not None and male_elem.text else 0),
                    'female': int(female_elem.text if female_elem is not None and female_elem.text else 0)
                }
            
            age_groups = camera.find('.//ageGroups') or camera.find('.//AgeGroups')
            if age_groups is not None:
                analytics_data['age_groups'] = {}
                for group in age_groups:
                    analytics_data['age_groups'][group.tag] = int(group.text or 0)
            
            cameras[camera_id] = analytics_data
        
        return {'cameras': list(cameras.values())}
    except ET.ParseError as e:
        logger.error(f"Analytics XML parse error: {str(e)}")
        return {'cameras': [], 'error': str(e)}


def parse_camera_list_xml(xml_data: str) -> Dict[str, Any]:
    """Parse camera list from VMS XML response - /rsapi/cameras endpoint"""
    try:
        root = ET.fromstring(xml_data)
        cameras = []
        
        # VMS returns <Cameras><Camera><ID>...<Name>... format
        for camera in root.findall('.//Camera') or root.findall('.//camera'):
            # Get ID - can be in <ID> tag or id attribute
            camera_id = camera.findtext('ID') or camera.findtext('Id') or camera.findtext('id')
            if not camera_id:
                camera_id = camera.get('id') or camera.get('ID')
            if not camera_id:
                continue
            
            # Get Name
            name = camera.findtext('Name') or camera.findtext('name') or camera.get('name')
            if not name:
                name = f"Kamera {camera_id[:8]}"
            
            # Get other info
            description = camera.findtext('Description') or camera.findtext('description') or ''
            disabled = camera.findtext('Disabled') or camera.findtext('disabled') or 'false'
            is_disabled = disabled.lower() == 'true'
            model = camera.findtext('ModelName') or camera.findtext('modelName') or ''
            
            cameras.append({
                'camera_id': camera_id,
                'name': name,
                'description': description,
                'disabled': is_disabled,
                'model': model,
                'type': 'unknown'  # Will be determined by module data
            })
        
        return {'cameras': cameras, 'total': len(cameras)}
    except ET.ParseError as e:
        logger.error(f"Camera list XML parse error: {str(e)}")
        return {'cameras': [], 'error': str(e)}
