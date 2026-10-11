import struct
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

p=Path(sys.argv[1]); data=p.read_bytes()
u16=lambda o:struct.unpack_from('<H',data,o)[0]
u32=lambda o:struct.unpack_from('<I',data,o)[0]
pe=u32(0x3c);assert data[pe:pe+4]==b'PE\0\0'
count=u16(pe+6); opt=pe+24;size=u16(pe+20)
sections=[]
for i in range(count):
    start=opt+size+i*40
    name=data[start:start+8].rstrip(b'\0').decode()
    virtual_size,rva,rawsize,raw=struct.unpack_from('<IIII',data,start+8)
    sections.append((name,rva,max(virtual_size,rawsize),raw))
def offset(rva):
    for _,base,length,raw in sections:
        if base<=rva<base+length:return raw+rva-base
    raise ValueError(rva)
directory=opt+(112 if u16(opt)==0x20b else 96)
resource=u32(directory+16);base=offset(resource)
def entries(relative):
    o=base+relative; n=u16(o+12)+u16(o+14)
    return [struct.unpack_from('<II',data,o+16+i*8) for i in range(n)]
manifests=[]
for kind,value in entries(0):
    if kind!=24:continue
    for ident,langtable in entries(value&0x7fffffff):
        for lang,leaf in entries(langtable&0x7fffffff):
            rva,length=struct.unpack_from('<II',data,base+leaf)
            text=data[offset(rva):offset(rva)+length].rstrip(b'\0').decode('utf-8-sig')
            ET.fromstring(text)
            manifests.append((ident,lang,text))
print(f'{p.name}: {len(data):,} bytes, PE type {u16(opt):x}, {count} sections, {len(manifests)} valid XML manifests')
for ident,lang,text in manifests:print(f'Manifest ID {ident}, language {lang}:\n{text}')
assert len(manifests)==1,'Expected exactly one application manifest'
