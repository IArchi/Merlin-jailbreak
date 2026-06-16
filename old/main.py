import os
import copy
import time
import uuid
import shutil
import argparse
from PIL import Image
from datetime import datetime

bytezero = b'\x00'

def read_merlin_playlist(stream):
    items = []
    while (b:=stream.read(2)):

        item = dict()

        if not b: raise Exception("wrong file format")
        item['id'] = int.from_bytes(b, byteorder='little')

        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['parent_id'] = int.from_bytes(b, byteorder='little')

        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['order'] = int.from_bytes(b, byteorder='little')

        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['nb_children'] = int.from_bytes(b, byteorder='little')

        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['fav_order'] = int.from_bytes(b, byteorder='little')

        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['type'] = int.from_bytes(b, byteorder='little')

        b = stream.read(4)
        if not b: raise Exception("wrong file format")
        item['limit_time'] = int.from_bytes(b, byteorder='little')

        b = stream.read(4)
        if not b: raise Exception("wrong file format")
        item['add_time'] = int.from_bytes(b, byteorder='little')

        b = stream.read(1)
        if not b: raise Exception("wrong file format")
        length = int.from_bytes(b, byteorder='little')
        b = stream.read(length)
        item['uuid'] = b.decode('UTF-8')
        b = stream.read(64-length)

        b = stream.read(1)
        if not b: raise Exception("wrong file format")
        length = int.from_bytes(b, byteorder='little')
        b = stream.read(length)
        item['title'] = b.decode('UTF-8')
        b = stream.read(66-length)

        items.append(item)
    return items

def write_merlin_playlist(stream, items):
    for item in items:

        b = item['id'].to_bytes(2,byteorder='little')
        stream.write(b)

        b = item['parent_id'].to_bytes(2, byteorder='little')
        stream.write(b)

        b = item['order'].to_bytes(2, byteorder='little')
        stream.write(b)

        b = item['nb_children'].to_bytes(2, byteorder='little')
        stream.write(b)

        b = item['fav_order'].to_bytes(2, byteorder='little')
        stream.write(b)

        b = item['type'].to_bytes(2, byteorder='little')
        stream.write(b)

        b = item['limit_time'].to_bytes(4, byteorder='little')
        stream.write(b)

        b = item['add_time'].to_bytes(4, byteorder='little')
        stream.write(b)

        b = item['uuid'].encode('UTF-8')
        length = len(b)
        length_b = length.to_bytes(1, byteorder='little')
        stream.write(length_b)
        stream.write(b)
        stream.write(bytezero*(64-length))

        b = item['title'].encode('UTF-8')
        length = len(b)
        length_b = length.to_bytes(1, byteorder='little')
        stream.write(length_b)
        stream.write(b)
        stream.write(bytezero*(66-length))

def build_hierarchy(items):
    item_dict = {item['id']: item for item in items}

    for item in item_dict.values():
        item['children'] = []

    hierarchy = {}
    for item in items:
        parent_id = item['parent_id']
        if parent_id == 0:
            hierarchy[item['id']] = item
        else:
            parent = item_dict.get(parent_id)
            if parent: parent['children'].append(item)

    return hierarchy

def print_hierarchy(node, level=0):
    indent = ' ' * 4 * level
    prefix = '|-- ' if level > 0 else ''
    if node['type'] == 4: print(f"{indent}{prefix}{node['title']} (id: {node['id']}, order: {node['order']})")
    else: print(f"{indent}{prefix}{node['title']} (id: {node['id']}, order: {node['order']}, children: {node['nb_children']})")
    for child in node.get('children', []):
        print_hierarchy(child, level + 1)

def hierarchy_to_dir(path, node):
    # Ignore root
    if node['type'] == 1:
        for child in node.get('children', []):
            hierarchy_to_dir(path, child)
    else:
        # Create directory
        parent_dir = os.path.join(path, node['title'])
        os.makedirs(parent_dir, exist_ok=True)

        # Save UUID
        with open(os.path.join(parent_dir, '.uuid'), 'w', encoding='utf-8') as f: f.write(node['uuid'])

        # Copy assets
        if node['imagepath'] and os.path.exists(node['imagepath']):
            shutil.copy(node['imagepath'], os.path.join(parent_dir, f'{node["uuid"]}.jpg'))
        if node['soundpath'] and os.path.exists(node['soundpath']):
            shutil.copy(node['soundpath'], os.path.join(parent_dir, f'{node["uuid"]}.mp3'))

        # Recursive
        if node['type'] != 4:
            for child in node.get('children', []):
                hierarchy_to_dir(parent_dir, child)

def read(stream, dirname):
    items = read_merlin_playlist(stream)
    for item in items:
        if item['type'] == 1: # root
            item['imagepath'] = ''
        else:
            item['imagepath'] = os.path.join(dirname, item['uuid'] + '.jpg')
        if item['type'] in [4, 36]:
            item['soundpath'] = os.path.join(dirname, item['uuid'] + '.mp3')
        else:
            item['soundpath'] = ''
    return items

def list_dir(path, parent_id=1, id_counter=1):
    items = []
    to_move = {}
    order = 0
    for entry in os.listdir(path):
        fullpath = os.path.join(path, entry)
        if os.path.isdir(fullpath):
            # Load UUID or generate a new one
            uuid_file = os.path.join(fullpath, '.uuid')
            if os.path.isfile(uuid_file):
                with open(uuid_file) as f: _uuid = f.read()
            else:
                _uuid = str(uuid.uuid4())

            # Check if the directory is terminal or not
            has_songs = any([entry for entry in os.listdir(fullpath) if entry.endswith('.mp3')])
            if not has_songs:
                id_counter += 1
                item = {
                    'id'            : id_counter,
                    'parent_id'     : parent_id,
                    'order'         : order,
                    'nb_children'   : 0,
                    'fav_order'     : 0,
                    'type'          : 10 if entry == 'Merlin_favorite' else 2,
                    'limit_time'    : 0,
                    'add_time'      : int(time.time()),
                    'uuid'          : _uuid,
                    'title'         : entry,
                    'imagepath'     : f"{_uuid}.jpg",
                    'soundpath'     : ''
                }
                items.append(item)
                order += 1

                # Move assets
                thumbnails = [os.path.join(fullpath, entry) for entry in os.listdir(fullpath) if entry.endswith('.jpg') or entry.endswith('.jpeg') or entry.endswith('.png')]
                if len(thumbnails): to_move[thumbnails[0]] = f"{_uuid}.jpg"

                # Recursive exploration
                childs, child_to_move, id_counter = list_dir(fullpath, id_counter, id_counter)
                items.extend(childs)
                to_move = {**to_move, **child_to_move}

            # Directory is terminal (ie contains a song)
            else:
                id_counter += 1
                item = {
                    'id'            : id_counter,
                    'parent_id'     : parent_id,
                    'order'         : order,
                    'nb_children'   : 0,
                    'fav_order'     : 0,
                    'type'          : 4,
                    'limit_time'    : 0,
                    'add_time'      : int(time.time()),
                    'uuid'          : _uuid,
                    'title'         : entry,
                    'imagepath'     : f"{_uuid}.jpg",
                    'soundpath'     : f"{_uuid}.mp3"
                }
                items.append(item)
                order += 1

                # Move assets
                thumbnails = [os.path.join(fullpath, entry) for entry in os.listdir(fullpath) if entry.endswith('.jpg') or entry.endswith('.jpeg') or entry.endswith('.png')]
                if len(thumbnails): to_move[thumbnails[0]] = f"{_uuid}.jpg"
                songs = [os.path.join(fullpath, entry) for entry in os.listdir(fullpath) if entry.endswith('.mp3')]
                if len(songs): to_move[songs[0]] = f"{_uuid}.mp3"
    return items, to_move, id_counter

def empty_dir(path):
    if not os.path.isdir(path): return
    for filename in os.listdir(path):
        filepath = os.path.join(path, filename)
        try:
            if os.path.isfile(filepath) or os.path.islink(filepath): os.unlink(filepath)
            elif os.path.isdir(filepath): shutil.rmtree(filepath)
        except Exception as e:
            print(f'Failed to delete {filepath}. Reason: {e}')

def resize_img(src, dst):
    pil_img = Image.open(src)
    pil_img = pil_img.convert('RGB')
    width, height = pil_img.size

    if width == height:
        result = pil_img
    elif width > height:
        result = Image.new(pil_img.mode, (width, width), (0,0,0))
        result.paste(pil_img, (0, (width - height) // 2))
    else:
        result = Image.new(pil_img.mode, (height, height), (0,0,0))
        result.paste(pil_img, ((height - width) // 2, 0))

    im_thumb = result.resize((128, 128), Image.LANCZOS)
    im_thumb.save(dst, quality=95)

def main():
    # Parse arguments
    parser = argparse.ArgumentParser(description='Manage playlist from Merlin musicbox.')
    parser.add_argument('-e', '--extract', type=str, help='Extract playlist to directories')
    parser.add_argument('-b', '--build', type=str, help='Build a directory as a Merlin playlist')
    parser.add_argument('-o', '--output', type=str, help='Output directory (If empty, a name will be generated)')
    parser.add_argument('-v', '--verbose', action='store_true', help='Display logs')
    args = parser.parse_args()

    now = datetime.now()
    date_time = now.strftime('%Y%m%d%H%M%S')

    # Extract playlist
    if args.extract:
        # Parse directory
        dirname = os.path.dirname(os.path.abspath(args.extract))

        # Read playlist
        items = []
        with open(args.extract, "rb") as file: items = read(file, dirname)
        hierarchy = build_hierarchy(copy.deepcopy(items))
        if args.verbose: print_hierarchy(next(iter(hierarchy.values())))

        # Extract to directories
        import_dir = os.path.join(dirname, f'extract_{date_time}') if not args.output else os.path.abspath(args.output)
        empty_dir(import_dir)
        hierarchy_to_dir(import_dir, next(iter(hierarchy.values())))

        # Export config files
        for file in os.listdir(dirname):
            if not file.endswith('.cfg'): continue
            shutil.copy(os.path.join(dirname, file), os.path.join(import_dir, file))

        print(f'[SUCCESS] Playlist has been completely extracted to {import_dir}')
        print(f'[INFO] You can now add your own songs into this directory.')
        print(f'[INFO] Once done, you can build a new playlist using the following command:')
        print(f'[INFO] python3 merlin.py -b {import_dir}')

    # Build playlist
    elif args.build:
        # Read directory
        items, to_move, _ = list_dir(args.build)
        items.insert(0, {
            'id'            : 1,
            'parent_id'     : 0,
            'order'         : 0,
            'nb_children'   : 0,
            'fav_order'     : 0,
            'type'          : 1,
            'limit_time'    : 0,
            'add_time'      : 0,
            'uuid'          : '',
            'title'         : 'Root',
            'imagepath'     : '',
            'soundpath'     : ''
        })

        # Set children count
        for obj in items:
            if obj['type'] == 4: continue
            obj['nb_children'] = sum(1 for child in items if child['parent_id'] == obj['id'])

        hierarchy = build_hierarchy(copy.deepcopy(items))
        if args.verbose: print_hierarchy(next(iter(hierarchy.values())))

        # Move assets from to_move
        build_dir = os.path.abspath(os.path.join(args.build, '..', f'build_{date_time}')) if not args.output else os.path.abspath(args.output)
        empty_dir(build_dir)
        os.makedirs(build_dir, exist_ok=True)

        for source, target in to_move.items():
            try:
                # Move songs
                if source.endswith('.mp3'): shutil.copy(source, f'{build_dir}/{target}')
                # Resize all images
                else: resize_img(source, f'{build_dir}/{target}')
            except Exception as e:
                print(e)
                pass

        # Forge a new playlist.bin
        with open(os.path.join(build_dir, 'playlist.bin'), "wb") as file: write_merlin_playlist(file, items)

        # Copy config files
        for file in os.listdir(args.build):
            if not file.endswith('.cfg'): continue
            shutil.copy(os.path.join(args.build, file), os.path.join(build_dir, file))

        print(f'[SUCCESS] Playlist has been completely built into {build_dir}')
        print(f'[INFO] You can now copy the content of this directory to your Merlin box.')
        pass

    return

if __name__ == "__main__":
    main()
