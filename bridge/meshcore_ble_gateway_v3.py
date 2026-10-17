"""Nombre antiguo, solo para instalaciones previas: lanza meshcore_ble_gateway.py."""
import os
import runpy

runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'meshcore_ble_gateway.py'), run_name='__main__')
